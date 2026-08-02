import {
  HostingerDatabaseSchemaInventoryError,
} from "./operator-hostinger-database-schema-policy.mjs";

const ROUTE = "/v1/operator/hostinger/database/schema/inventory";
const SCOPE = "operator:hostinger:database:schema:read";
const SAFE_ID = /^[A-Za-z0-9._:-]{3,128}$/;
const SAFE_HOST = /^[a-z0-9.-]{1,253}$/;
const SAFE_LOGICAL_ID = /^[A-Za-z0-9 ._:-]{2,128}$/;

function response(status, payload, headers = {}) {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      ...headers,
    }),
    body: JSON.stringify(payload),
  });
}

function failure(status, error, correlationId) {
  return response(status, {
    error,
    ...(correlationId ? { correlationId } : {}),
    productionChanged: false,
    rowsReturned: false,
    valuesReturned: false,
  });
}

function parseBody(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value ?? ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new HostingerDatabaseSchemaInventoryError(
      "invalid_request",
      "request body must be a JSON object",
    );
  }
}

function header(headers, name) {
  if (!headers || typeof headers !== "object") return undefined;
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
}

function correlationId(request, body) {
  const value = String(
    body.correlationId ??
      header(request.headers, "x-correlation-id") ??
      header(request.headers, "x-request-id") ??
      "",
  ).trim();
  if (!SAFE_ID.test(value)) {
    throw new HostingerDatabaseSchemaInventoryError(
      "invalid_request",
      "correlationId is invalid",
   );
  }
  return value;
}

function safeHost(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return SAFE_HOST.test(normalized) ? normalized : "invalid";
}

function safeLogicalId(value) {
  const normalized = String(value ?? "").trim();
  return SAFE_LOGICAL_ID.test(normalized) ? normalized : "invalid";
}

function publicDecision(value) {
  return Object.freeze({
    decisionId: value.decisionId,
    effect: value.effect,
    policyVersion: value.policyVersion,
  });
}

function statusFor(code) {
  if (code === "adapter_unavailable") return 503;
  if (["provider_contract_violation", "provider_returned_data"].includes(code)) return 502;
  if (
    [
      "host_not_allowed",
      "engine_not_allowed",
      "schema_only_required",
      "data_access_not_allowed",
    ].includes(code)
  ) {
    return 403;
  }
  if (code === "invalid_request") return 400;
  return 500;
}

function auditMetadata(body, result, decision, errorCode = "none") {
  return Object.freeze({
    host: safeHost(body?.host),
    logicalDatabaseId: safeLogicalId(body?.logicalDatabaseId),
    engine: String(body?.engine ?? "invalid").trim().toLowerCase(),
    schemaCount: Array.isArray(body?.schemas) ? body.schemas.length : 0,
    objectCount: Number.isSafeInteger(result?.objectCount) ? result.objectCount : 0,
    schemaOnly: result?.schemaOnly === true,
    rowsReturned: result?.rowsReturned === true,
    valuesReturned: result?.valuesReturned === true,
    productionChanged: result?.productionChanged === true,
    authorizationEffect: decision?.effect ?? "unknown",
    errorCode,
  });
}

export function createHostingerDatabaseSchemaInventoryHttpApp({
  app,
  authenticator,
  authorization,
  inventory,
  audit,
} = {}) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest required");
  if (typeof authenticator?.authenticate !== "function") throw new TypeError("authenticator required");
  if (typeof authorization?.decide !== "function") throw new TypeError("authorization required");
  if (typeof inventory?.inventory !== "function") throw new TypeError("inventory required");
  if (typeof audit?.recordOperatorCapabilityResult !== "function") throw new TypeError("audit required");

  async function record({
    identity,
    tenantId,
    correlationId,
    host,
    logicalDatabaseId,
    outcome,
    metadata,
  }) {
    return audit.recordOperatorCapabilityResult({
      identity,
      tenantId,
      action: "operator.hostinger.database.schema.inventory",
      resource: `hostinger-database:${host}:${logicalDatabaseId}`,
      outcome,
      correlationId,
      metadata,
    });
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const url = new URL(request.url ?? "/", "http://gateway.local");
      if (url.pathname !== ROUTE) return app.handleRequest(request);

      if (String(request.method ?? "GET").toUpperCase() !== "POST") {
        return response(
          405,
          {
            error: "method_not_allowed",
            productionChanged: false,
            rowsReturned: false,
            valuesReturned: false,
          },
          { allow: "POST" },
        );
      }

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return failure(401, "unauthorized");

      const tenantId = String(identity.principal?.tenantId ?? "").trim();
      const operatorId = String(identity.principal?.id ?? "").trim();
      if (!tenantId || !operatorId) return failure(403, "tenant_context_unavailable");

      let body;
      let cid;
      try {
        body = parseBody(request.body);
        cid = correlationId(request, body);
      } catch (error) {
        return failure(
          400,
          error instanceof HostingerDatabaseSchemaInventoryError
            ? error.code
            : "invalid_request",
        );
      }

      const host = safeHost(body.host);
      const logicalDatabaseId = safeLogicalId(body.logicalDatabaseId);
      const decision = authorization.decide({
        identity,
        action: "operator.hostinger.database.schema.inventory",
        resource: `hostinger-database:${host}:${logicalDatabaseId}`,
        requiredScopes: [SCOPE],
      });

      const auditBase = {
        identity,
        tenantId,
        correlationId: cid,
        host,
        logicalDatabaseId,
      };

      if (decision.effect !== "allow") {
        try {
          await record({
            ...auditBase,
            outcome: "denied",
            metadata: auditMetadata(body, undefined, decision, "forbidden"),
          });
        } catch {
          // A denial stays denied even if audit persistence is unavailable.
        }
        return response(403, {
          error: "forbidden",
          authorizationDecision: publicDecision(decision),
          correlationId: cid,
          productionChanged: false,
          rowsReturned: false,
          valuesReturned: false,
        });
      }

      try {
        const result = await inventory.inventory({
          institution: "API Developers.digital",
          tenant: tenantId,
          operator: operatorId,
          correlationId: cid,
          host: body.host,
          logicalDatabaseId: body.logicalDatabaseId,
          engine: body.engine,
          schemaOnly: body.schemaOnly,
          includeRows: body.includeRows ?? false,
          includeValues: body.includeValues ?? false,
          schemas: body.schemas ?? [],
        });

        try {
          await record({
            ...auditBase,
            outcome: "success",
            metadata: auditMetadata(body, result, decision),
          });
        } catch {
          return failure(503, "audit_unavailable", cid);
        }

        return response(200, {
          ...result,
          authorizationDecision: publicDecision(decision),
        });
      } catch (error) {
        const code =
          error instanceof HostingerDatabaseSchemaInventoryError
            ? error.code
            : "internal_error";
        try {
          await record({
            ...auditBase,
            outcome: "failure",
            metadata: auditMetadata(body, undefined, decision, code),
          });
        } catch {
          return failure(503, "audit_unavailable", cid);
        }
        return failure(statusFor(code), code, cid);
      }
    },
  });
}
