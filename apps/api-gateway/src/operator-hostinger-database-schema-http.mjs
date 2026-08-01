import {
  HostingerDatabaseSchemaInventoryError,
} from "./operator-hostinger-database-schema-policy.mjs";

const ROUTE = "/v1/operator/hostinger/database/schema/inventory";
const REQUIRED_SCOPE = "operator:hostingerdatabase:schema:read";
const SAFE_REFERENCE = /^[A-Za-z0-9._:-]{3,128}$/;
const SAFE_HOST = /^[a-z0-9.-]{1,253}$/;
const SAFE_LOGICAL_ID = /^[A-Za-z0-9 ._:-]{2,128}$/;

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
    throw new HostingerDatabaseSchemaInventoryError(
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
    throw new HostingerDatabaseSchemaInventoryError(
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
    throw new HostingerDatabaseSchemaInventoryError(
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

function safeLogicalDatabaseId(value) {
  const logicalDatabaseId = String(value ?? "").trim();
  return SAFE_LOGICAL_ID.test(logicalDatabaseId) ? logicalDatabaseId : "invalid";
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
    case "provider_returned_data":
      return 502;
    case "host_not_allowed":
    case "engine_not_allowed":
    case "schema_only_required":
    case "data_access_not_allowed":
      return 403;
    case "invalid_request":
      return 400;
    default:
      return 500;
  }
}

function auditMetadata({ body, result, errorCode, authorizationDecision }) {
  const schemas = Array.isArray(body?.schemas) ? body.schemas : [];

  return Object.freeze({
    host: safeHost(body?.host),
    logicalDatabaseId: safeLogicalDatabaseId(body?.logicalDatabaseId),
    engine: String(body?.engine ?? "invalid").trim().toLowerCase(),
    schemaCount: schemas.length,
    objectCount: Number.isSafeInteger(result?.objectCount) ? result.objectCount : 0,
    schemaOnly: result?.schemaOnly === true,
    rowsReturned: result?.rowsReturned === true,
    valuesReturned: result?.valuesReturned === true,
    productionChanged: result?.productionChanged === true,
    authorizationEffect: authorizationDecision?.effect ?? "unknown",
    errorCode: errorCode ?? "none",
  });
}

export function createHostingerDatabaseSchemaInventoryHttpApp({
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
            rowsReturned: false,
            valuesReturned: false,
          },
          { allow: "POST" },
        );
      }

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) {
        return jsonResponse(401, {
          error: "unauthorized",
          productionChanged: false,
          rowsReturned: false,
          valuesReturned: false,
        });
      }

      const principal = identity.principal ?? {};
      const tenantId = String(principal.tenantId ?? "").trim();
      const operatorId = String(principal.id ?? "").trim();

      if (!tenantId || !operatorId) {
        return jsonResponse(403, {
          error: "tenant_context_unavailable",
          productionChanged: false,
          rowsReturned: false,
          valuesReturned: false,
        });
      }

      let body;
      let correlationId;
      try {
        body = parseBody(request.body);
        correlationId = correlationIdFrom(request, body);
      } catch (error) {
        const code =
          error instanceof HostingerDatabaseSchemaInventoryError
            ? error.code
            : "invalid_request";
        return jsonResponse(400, {
          error: code,
          productionChanged: false,
          rowsReturned: false,
          valuesReturned: false,
        });
      }

      const host = safeHost(body.host);
      const logicalDatabaseId = safeLogicalDatabaseId(body.logicalDatabaseId);
      const authorizationDecision = authorization.decide({
        identity,
        action: "operator.hostinger.database.schema.inventory",
        resource: `hostinger-database:${host}:${logicalDatabaseId}`,
        requiredScopes: [REQUIRED_SCOPE],
      });

      if (authorizationDecision.effect !== "allow") {
        try {
          await recordAudit({
            identity,
            tenantId,
            correlationId,
            host,
            logicalDatabaseId,
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
          rowsReturned: false,
          valuesReturned: false,
        });
      }

      try {
        const result = await inventory.inventory({
          institution: "API Developers.digital",
          tenant: tenantId,
          operator: operatorId,
          correlationId,
          host: body.host,
          logicalDatabaseId: body.logicalDatabaseId,
          engine: body.engine,
          schemaOnly: body.schemaOnly,
          includeRows: body.includeRows ?? false,
          includeValues: body.includeValues ?? false,
          schemas: body.schemas ?? [],
        });

        try {
          await recordAudit({
            identity,
            tenantId,
            correlationId,
            host,
            logicalDatabaseId,
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
            rowsReturned: false,
            valuesReturned: false,
          });
        }

        return jsonResponse(200, {
          ...result,
          authorizationDecision: publicDecision(authorizationDecision),
        });
      } catch (error) {
        const inventoryError =
          error instanceof HostingerDatabaseSchemaInventoryError
            ? error
            : new HostingerDatabaseSchemaInventoryError(
                "internal_error",
                "database schema inventory operation failed",
              );
        const status = statusForInventoryError(inventoryError);

        try {
          await recordAudit({
            identity,
            tenantId,
            correlationId,
            host,
            logicalDatabaseId,
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
            rowsReturned: false,
            valuesReturned: false,
          });
        }

        return jsonResponse(status, {
          error: inventoryError.code,
          correlationId,
          productionChanged: false,
          rowsReturned: false,
          valuesReturned: false,
      });
    }
  },
 });
}
