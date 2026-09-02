import { randomUUID } from "node:crypto";

import {
  createApiKeyRecord,
  hashApiKey,
  toPublicApiKeyRecord,
} from "@apidevelopers/apikey-core";

const ROUTE = "/v1/operator/bootstrap";
export const OPERATOR_BOOTSTRAP_CONFIRMATION =
  "IGOR_APROVA_OPERATOR_BOOTSTRAP_20260902";
const OPERATOR_SCOPE = "operator:resource:read";
const TENANT_PATTERN = /^component\.tenant\.[a-z0-9](?:[a-z0-9.-]{0,158}[a-z0-9])?$/;

function jsonResponse(status, payload) {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    }),
    body: JSON.stringify(payload),
  });
}

function readHeader(headers, name) {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === expected) {
      return String(value ?? "").trim() || undefined;
    }
  }
  return undefined;
}

function parseBody(body) {
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    !Buffer.isBuffer(body)
  ) {
    return body;
  }
  if (typeof body !== "string" || !body.trim()) {
    throw new TypeError("JSON request body is required");
  }
  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("request body must be a JSON object");
  }
  return parsed;
}

function requireTenantId(value) {
  const tenantId = String(value ?? "").trim();
  if (!TENANT_PATTERN.test(tenantId)) {
    throw new TypeError("tenantId must be a canonical component tenant id");
  }
  return tenantId;
}

function requireOperatorKey(value) {
  const secret = String(value ?? "");
  if (secret.length < 32) {
    throw new TypeError("operatorKey must contain at least 32 characters");
  }
  return secret;
}

function requireRepository(repository) {
  for (const method of ["create", "getActiveByPrefix"]) {
    if (typeof repository?.[method] !== "function") {
      throw new TypeError(`apiKeyRepository.${method} must be a function`);
    }
  }
  return repository;
}

function hasAdminWildcard(identity) {
  const scopes = identity?.principal?.scopes;
  return Array.isArray(scopes) && scopes.includes("admin:*");
}

export function createOperatorBootstrapHttpApp({
  app,
  authenticator,
  authorization,
  apiKeyRepository,
  audit,
  idFactory = randomUUID,
  now = () => new Date().toISOString(),
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
  if (typeof audit?.recordOperatorCapabilityResult !== "function") {
    throw new TypeError("audit.recordOperatorCapabilityResult must be a function");
  }
  const repository = requireRepository(apiKeyRepository);

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsedUrl = new URL(request.url ?? "/", "http://gateway.local");
      if (parsedUrl.pathname !== ROUTE) {
        return app.handleRequest(request);
      }
      if (method !== "POST") {
        return jsonResponse(405, { error: "method_not_allowed" });
      }

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return jsonResponse(401, { error: "unauthorized" });

      const authorizationDecision = authorization.decide({
        identity,
        action: "operator.bootstrap",
        resource: "institution:operator-bootstrap",
        requiredScopes: ["admin:*"],
      });
      if (
        authorizationDecision.effect !== "allow" ||
        !hasAdminWildcard(identity)
      ) {
        return jsonResponse(403, {
          error: "forbidden",
          authorizationDecision,
        });
      }

      const confirmation = readHeader(
        request.headers,
        "x-operation-confirmation",
      );
      if (confirmation !== OPERATOR_BOOTSTRAP_CONFIRMATION) {
        return jsonResponse(428, {
          error: "explicit_confirmation_required",
          requiredConfirmation: OPERATOR_BOOTSTRAP_CONFIRMATION,
          authorizationDecision,
        });
      }

      let tenantId;
      let operatorKey;
      let correlationId;
      try {
        const body = parseBody(request.body);
        const allowed = new Set(["tenantId", "operatorKey", "correlationId"]);
        for (const key of Object.keys(body)) {
          if (!allowed.has(key)) {
            throw new TypeError("request contains an unsupported field");
          }
        }
        tenantId = requireTenantId(body.tenantId);
        operatorKey = requireOperatorKey(body.operatorKey);
        correlationId =
          String(
            body.correlationId ??
              readHeader(request.headers, "x-correlation-id") ??
              readHeader(request.headers, "x-request-id") ??
              "",
          ).trim() || undefined;
      } catch (error) {
        return jsonResponse(400, {
          error: "invalid_operator_bootstrap_request",
          message: error instanceof Error ? error.message : "invalid request",
          authorizationDecision,
        });
      }

      const prefix = operatorKey.slice(0, 12);
      const keyHash = hashApiKey(operatorKey);
      const existing = await repository.getActiveByPrefix(tenantId, prefix);

      if (existing) {
        if (existing.hash !== keyHash) {
          return jsonResponse(409, {
            error: "operator_key_prefix_collision",
            authorizationDecision,
            productionChanged: false,
            secretReturned: false,
          });
        }

        await audit.recordOperatorCapabilityResult({
          identity,
          tenantId,
          action: "operator.bootstrap",
          resource: "institution:operator-bootstrap",
          outcome: "success",
          correlationId,
          metadata: {
            apiKeyId: existing.id,
            apiKeyPrefix: existing.prefix,
            idempotent: true,
            operatorScope: OPERATOR_SCOPE,
            secretReturned: false,
          },
        });

        return jsonResponse(200, {
          tenantId,
          apiKey: toPublicApiKeyRecord(existing),
          idempotent: true,
          secretStoredAsHash: true,
          secretReturned: false,
          productionChanged: false,
          authorizationDecision,
        });
      }

      const record = createApiKeyRecord({
        id: idFactory(),
        tenantId,
        name: "Institutional Operator",
        prefix,
        keyHash,
        scopes: [OPERATOR_SCOPE],
        createdAt: now(),
      });
      const created = await repository.create(record);

      await audit.recordOperatorCapabilityResult({
        identity,
        tenantId,
        action: "operator.bootstrap",
        resource: "institution:operator-bootstrap",
        outcome: "success",
        correlationId,
        metadata: {
          apiKeyId: created.id,
          apiKeyPrefix: created.prefix,
          idempotent: false,
          operatorScope: OPERATOR_SCOPE,
          secretReturned: false,
        },
      });

      return jsonResponse(201, {
        tenantId,
        apiKey: toPublicApiKeyRecord(created),
        idempotent: false,
        secretStoredAsHash: true,
        secretReturned: false,
        productionChanged: true,
        authorizationDecision,
      });
    },
  });
}
