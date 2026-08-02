
import { createHash } from "node:crypto";
import {
  OPERATOR_READONLY_CAPABILITIES,
  OperatorReadonlyError,
  normalizeTarget,
  requireText,
} from "./operator-readonly-contract.mjs";

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const SAFE_PATHS = Object.freeze({
  "/v1/operator/status": Object.freeze({
    capability: "status",
    method: "operatorStatus",
    allowedKeys: Object.freeze(["correlationId", "target", "limit", "cursor"]),
  }),
  "/v1/operator/inventory": Object.freeze({
    capability: "inventory",
    method: "operatorInventory",
    allowedKeys: Object.freeze(["correlationId", "target", "limit", "cursor"]),
  }),
  "/v1/operator/read": Object.freeze({
    capability: "read",
    method: "operatorRead",
    allowedKeys: Object.freeze(["correlationId", "target", "fields"]),
  }),
  "/v1/operator/audit": Object.freeze({
    capability: "audit",
    method: "operatorAudit",
    allowedKeys: Object.freeze(["correlationId", "target", "limit", "cursor", "outcome"]),
  }),
});

function jsonResponse(status, payload, extraHeaders = {}) {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    }),
    body: JSON.stringify(payload),
  });
}

function failure(status, error, correlationId, extraHeaders = {}) {
  return jsonResponse(
    status,
    {
      error,
      ...(correlationId ? { correlationId } : {}),
      productionChanged: false,
      contentReturned: false,
      rowsReturned: false,
      valuesReturned: false,
    },
    extraHeaders,
  );
}

function header(headers, name) {
  if (!headers || typeof headers !== "object") return undefined;
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
}

function extractCredential(headers = {}) {
  const direct = header(headers, "x-api-key");
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const authorization = header(headers, "authorization");
  if (typeof authorization !== "string") return null;
  const match = authorization.match(/^(?:ApiKey|Bearer)\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function credentialFingerprint(headers = {}) {
  const credential = extractCredential(headers);
  if (!credential) return "anonymous";
  return createHash("sha256").update(credential).digest("hex").slice(0, 16);
}

function bodyBytes(body) {
  if (typeof body === "string" || Buffer.isBuffer(body)) return Buffer.byteLength(body);
  if (body === undefined || body === null) return 0;
  return Buffer.byteLength(JSON.stringify(body));
}

function parseBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body) && !Buffer.isBuffer(body)) {
    return body;
  }
  if (typeof body !== "string" || body.trim() === "") {
    throw new OperatorReadonlyError("invalid_request", "JSON request body is required");
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
    return parsed;
  } catch {
    throw new OperatorReadonlyError("invalid_request", "request body must be a JSON object");
  }
}

function assertAllowedKeys(value, allowedKeys, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OperatorReadonlyError("invalid_request", `${path} must be an object`);
  }
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new OperatorReadonlyError("invalid_request", `${path} contains an unsupported field`, {
        field: `${path}.${key}`,
      });
    }
  }
}

function correlationIdFrom(request, body) {
  const candidate =
    body.correlationId ??
    header(request.headers, "x-correlation-id") ??
    header(request.headers, "x-request-id");
  return requireText(candidate, "correlationId");
}

function publicDecision(decision) {
  return Object.freeze({
    decisionId: String(decision.decisionId ?? ""),
    effect: decision.effect,
    policyVersion: String(decision.policyVersion ?? ""),
  });
}

function statusForError(error) {
  switch (error.code) {
    case "invalid_request":
      return 400;
    case "field_not_allowed":
      return 403;
    case "provider_contract_violation":
    case "provider_returned_sensitive_data":
      return 502;
    case "adapter_unavailable":
    case "audit_unavailable":
      return 503;
    default:
      return 500;
  }
}

function operationInput(route, body, context, target) {
  const common = { context, target };
  if (route.capability === "read") {
    return { ...common, fields: body.fields };
  }
  if (route.capability === "audit") {
    return {
      ...common,
      limit: body.limit,
      cursor: body.cursor,
      outcome: body.outcome,
    };
  }
  return {
    ...common,
    limit: body.limit,
    cursor: body.cursor,
  };
}

export function createOperatorReadonlyHttpApp({
  app,
  authenticator,
  authorization,
  core,
  audit,
  rateLimiter,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
} = {}) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest must be a function");
  if (typeof authenticator?.authenticate !== "function") throw new TypeError("authenticator.authenticate must be a function");
  if (typeof authorization?.decide !== "function") throw new TypeError("authorization.decide must be a function");
  if (typeof audit?.recordOperatorCapabilityResult !== "function") {
    throw new TypeError("audit.recordOperatorCapabilityResult must be a function");
  }
  if (typeof rateLimiter?.consume !== "function") throw new TypeError("rateLimiter.consume must be a function");
  for (const route of Object.values(SAFE_PATHS)) {
    if (typeof core?.[route.method] !== "function") throw new TypeError(`core.${route.method} must be a function`);
  }
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1024 || maxBodyBytes > 1024 * 1024) {
    throw new TypeError("maxBodyBytes must be between 1024 and 1048576");
  }

  async function recordDenied({ identity, tenantId, route, target, correlationId, decision }) {
    return audit.recordOperatorCapabilityResult({
      identity,
      tenantId,
      action: `operator.readonly.${route.capability}`,
      resource: `${target.provider}:${target.resourceType}${target.resourceId ? `:${target.resourceId}` : ""}`,
      outcome: "denied",
      correlationId,
      metadata: Object.freeze({
        operationId: OPERATOR_READONLY_CAPABILITIES[route.capability].operationId,
        provider: target.provider,
        resourceType: target.resourceType,
        resourceSpecified: Boolean(target.resourceId),
        authorizationEffect: decision.effect,
        errorCode: "forbidden",
        productionChanged: false,
        contentReturned: false,
        rowsReturned: false,
        valuesReturned: false,
      }),
    });
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const parsedUrl = new URL(request.url ?? "/", "http://gateway.local");
      const route = SAFE_PATHS[parsedUrl.pathname];
      if (!route) return app.handleRequest(request);

      if (String(request.method ?? "GET").toUpperCase() !== "POST") {
        return failure(405, "method_not_allowed", undefined, { allow: "POST" });
      }

      const rateDecision = rateLimiter.consume(credentialFingerprint(request.headers));
      if (!rateDecision.allowed) {
        const retryAfter = Math.max(
          1,
          Math.ceil((Number(rateDecision.resetAt) - Date.now()) / 1000),
        );
        return failure(429, "rate_limited", undefined, {
          "retry-after": String(retryAfter),
        });
      }

      let size;
      try {
        size = bodyBytes(request.body);
      } catch {
        return failure(400, "invalid_request");
      }
      if (size > maxBodyBytes) {
        return failure(413, "request_too_large");
      }

      let identity;
      try {
        identity = await authenticator.authenticate(request.headers ?? {});
      } catch {
        return failure(503, "authentication_unavailable");
      }
      if (!identity) return failure(401, "unauthorized");

      const tenantId = String(identity.principal?.tenantId ?? "").trim();
      const operatorId = String(identity.principal?.id ?? "").trim();
      if (!tenantId || !operatorId) return failure(403, "tenant_context_unavailable");

      let body;
      let correlationId;
      let target;
      try {
        body = parseBody(request.body);
        assertAllowedKeys(body, route.allowedKeys, "request");
        assertAllowedKeys(body.target, ["provider", "resourceType", "resourceId"], "target");
        correlationId = correlationIdFrom(request, body);
        target = normalizeTarget(body.target, route.capability === "read");
      } catch (error) {
        const normalized =
          error instanceof OperatorReadonlyError
            ? error
            : new OperatorReadonlyError("invalid_request", "request validation failed");
        return failure(statusForError(normalized), normalized.code);
      }

      const capability = OPERATOR_READONLY_CAPABILITIES[route.capability];
      const resource = `${target.provider}:${target.resourceType}${target.resourceId ? `:${target.resourceId}` : ""}`;
      let decision;
      try {
        decision = await authorization.decide({
          identity,
          action: `operator.readonly.${route.capability}`,
          resource,
          requiredScopes: [capability.scope],
        });
      } catch {
        return failure(503, "authorization_unavailable", correlationId);
      }
      if (!decision || !["allow", "deny"].includes(decision.effect)) {
        return failure(503, "authorization_unavailable", correlationId);
      }

      if (decision.effect !== "allow") {
        try {
          await recordDenied({ identity, tenantId, route, target, correlationId, decision });
        } catch {
          // A denial remains denied even when audit persistence is unavailable.
        }
        return jsonResponse(403, {
          error: "forbidden",
          authorizationDecision: publicDecision(decision),
          correlationId,
          productionChanged: false,
          contentReturned: false,
          rowsReturned: false,
          valuesReturned: false,
        });
      }

      const context = Object.freeze({
        institution: "API Developers.digital",
        tenant: tenantId,
        operator: operatorId,
        correlationId,
      });

      try {
        const result = await core[route.method](operationInput(route, body, context, target));
        return jsonResponse(200, {
          ...result,
          authorizationDecision: publicDecision(decision),
        });
      } catch (error) {
        const normalized =
          error instanceof OperatorReadonlyError
            ? error
            : new OperatorReadonlyError("internal_error", "operator read-only request failed");
        return failure(statusForError(normalized), normalized.code, correlationId);
      }
    },
  });
}
