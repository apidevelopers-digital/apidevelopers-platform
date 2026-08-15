import {
  HostingerStructureInventoryError,
} from "./operator-hostinger-structure-inventory.mjs";

const ROUTE = "/v1/operator/hostinger/structure/inventory";
const REQUIRED_SCOPE = "operator:hostinger:structure:read";
const SAFE_REFERENCE = /^[A-Za-z0-9._:-]{3,128}$/;
const SAFE_HOST = /^[a-z0-9.-]{1,253}$/;

function jsonResponse(status, payload, extraHeaders = {}) {
  return {
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    }),
    body: JSON.stringify(payload),
  };
}

function header(headers, name) {
  if (!headers || typeof headers !== "object") return undefined;
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
}

function parseBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  if (typeof body !== "string" || body.trim() === "") {
    throw new HostingerStructureInventoryError(
      "invalid_request",
      "JSON request body is required",
    );
  }

  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("body must be an object");
    }
    return parsed;
  } catch {
    throw new HostingerStructureInventoryError(
      "invalid_request",
      "request body must be valid JSON",
    );
  }
}

function correlationIdFrom(request, body) {
  const candidate =
    body.correlationId ??
    header(request.headers, "x-correlation-id") ??
    header(request.headers, "x-request-id");

  const correlationId = String(candidate ?? "").trim();
  if (!SAFE_REFERENCE.test(correlationId)) {
    throw new HostingerStructureInventoryError(
      "invalid_request",
      "correlationId must be a safe opaque identifier",
    );
  }
  return correlationId;
}

function safeHost(value) {
  const host = String(value ?? "").trim().toLowerCase();
  return SAFE_HOST.test(host) ? host : "invalid";
}

function publicDecision(decision) {
  return Object.freeze({
    decisionId: decision.decisionId,
    effect: decision.effect,
    policyVersion: decision.policyVersion,
  });
}

function statusForInventoryError(error) {
  switch (error.code) {
    case "adapter_unavailable":
      return 503;
    case "provider_contract_violation":
    case "provider_returned_content":
      return 502;
    case "host_not_allowed":
    case "path_not_allowed":
    case "root_not_allowed":
    case "extension_not_allowed":
    case "mode_not_allowed":
    case "content_not_allowed":
      return 403;
    case "invalid_request":
      return 400;
    default:
      return 500;
  }
}

function auditMetadata({ body, result, errorCode, authorizationDecision }) {
  const paths = Array.isArray(body?.paths) ? body.paths : [];
  const extensions = Array.isArray(body?.extensions) ? body.extensions : [];

  return Object.freeze({
    host: safeHost(body?.host),
    pathCount: paths.length,
    extensionCount: extensions.length,
    itemCount: Number.isSafeInteger(result?.count) ? result.count : 0,
    blockedCount: Array.isArray(result?.blocked) ? result.blocked.length : 0,
    productionChanged: result?.productionChanged === true,
    contentReturned: result?.contentReturned === true,
    authorizationEffect: authorizationDecision?.effect ?? "unknown",
    errorCode: errorCode ?? "none",
  });
}

export function createHostingerStructureInventoryHttpApp({
  app,
  authenticator,
  authorization,
  inventory,
  audit,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (typeof authorization?.decide !== "function") {
    throw new TypeError("authorization.decide must be a function");
  }
  if (typeof inventory?.inventory !== "function") {
    throw new TypeError("inventory.inventory must be a function");
  }
  if (typeof audit?.recordOperatorCapabilityResult !== "function") {
    throw new TypeError("audit.recordOperatorCapabilityResult must be a function");
  }

  async function recordAudit({
    identity,
    tenantId,
    correlationId,
    host,
    outcome,
    metadata,
  }) {
    return audit.recordOperatorCapabilityResult({
      identity,
      tenantId,
      action: "operator.hostinger.structure.inventory",
      resource: `hostinger:${host}`,
      outcome,
      correlationId,
      metadata,
    });
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsedUrl = new URL(request.url ?? "/", "http://gateway.local");

      if (parsedUrl.pathname !== ROUTE) {
        return app.handleRequest(request);
      }

      if (method !== "POST") {
        return jsonResponse(
          405,
          {
            error: "method_not_allowed",
            productionChanged: false,
            contentReturned: false,
          },
          { allow: "POST" },
        );
      }

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) {
        return jsonResponse(401, {
          error: "unauthorized",
          productionChanged: false,
          contentReturned: false,
        });
      }

      const principal = identity.principal ?? {};
      const tenantId = String(principal.tenantId ?? "").trim();
      const operatorId = String(principal.id ?? "").trim();

      if (!tenantId || !operatorId) {
        return jsonResponse(403, {
          error: "tenant_context_unavailable",
          productionChanged: false,
          contentReturned: false,
        });
      }

      let body;
      let correlationId;
      try {
        body = parseBody(request.body);
        correlationId = correlationIdFrom(request, body);
      } catch (error) {
        const code =
          error instanceof HostingerStructureInventoryError
            ? error.code
            : "invalid_request";
        return jsonResponse(400, {
          error: code,
          productionChanged: false,
          contentReturned: false,
        });
      }

      const host = safeHost(body.host);
      const authorizationDecision = authorization.decide({
        identity,
        action: "operator.hostinger.structure.inventory",
        resource: `hostinger:${host}`,
        requiredScopes: [REQUIRED_SCOPE],
      });

      if (authorizationDecision.effect !== "allow") {
        try {
          await recordAudit({
            identity,
            tenantId,
            correlationId,
            host,
            outcome: "denied",
            metadata: auditMetadata({
              body,
              errorCode: "forbidden",
              authorizationDecision,
            }),
          });
        } catch {
          // Denials remain denied even when the audit sink is unavailable.
        }

        return jsonResponse(403, {
          error: "forbidden",
          authorizationDecision: publicDecision(authorizationDecision),
          correlationId,
          productionChanged: false,
          contentReturned: false,
        });
      }

      try {
        const result = await inventory.inventory({
          institution: "API Developers.digital",
          tenant: tenantId,
          operator: operatorId,
          correlationId,
          host: body.host,
          mode: body.mode ?? "metadata-only",
          includeContent: body.includeContent ?? false,
          paths: body.paths,
          extensions: body.extensions,
        });

        try {
          await recordAudit({
            identity,
            tenantId,
            correlationId,
            host,
            outcome: "success",
            metadata: auditMetadata({
              body,
              result,
              authorizationDecision,
            }),
          });
        } catch {
          return jsonResponse(503, {
            error: "audit_unavailable",
            correlationId,
            productionChanged: false,
            contentReturned: false,
          });
        }

        return jsonResponse(200, {
          ...result,
          authorizationDecision: publicDecision(authorizationDecision),
        });
      } catch (error) {
        const inventoryError =
          error instanceof HostingerStructureInventoryError
            ? error
            : new HostingerStructureInventoryError(
                "internal_error",
                "inventory operation failed",
              );
        const status = statusForInventoryError(inventoryError);

        try {
          await recordAudit({
            identity,
            tenantId,
            correlationId,
            host,
            outcome: "failure",
            metadata: auditMetadata({
              body,
              errorCode: inventoryError.code,
              authorizationDecision,
            }),
          });
        } catch {
          return jsonResponse(503, {
            error: "audit_unavailable",
            correlationId,
            productionChanged: false,
            contentReturned: false,
          });
        }

        return jsonResponse(status, {
          error: inventoryError.code,
          correlationId,
          productionChanged: false,
          contentReturned: false,
        });
      }
    },
  });
}
