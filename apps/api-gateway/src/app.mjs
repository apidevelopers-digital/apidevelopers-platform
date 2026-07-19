import { randomUUID } from "node:crypto";
import { listPublicApis } from "./catalog.mjs";
import { createMemoryAuditLog } from "./audit-log.mjs";
import { createClientRegistry } from "./client-registry.mjs";
import { getOpenApiDocument } from "./openapi.mjs";
import { createFixedWindowRateLimiter } from "./rate-limit.mjs";
import { createAuthenticator } from "./security.mjs";

const BASE_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
});

function reply(status, body, requestId, headers = {}) {
  return {
    status,
    headers: { ...BASE_HEADERS, "x-request-id": requestId, ...headers },
    body: JSON.stringify({ ...body, requestId }),
  };
}

function parseBody(body) {
  if (body == null || body === "") return {};
  if (typeof body === "object" && !Buffer.isBuffer(body)) return body;
  return JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : body);
}

function errorReply(error, requestId) {
  const status = Number.isInteger(error?.status) ? error.status : 400;
  return reply(status, {
    error: error?.code ?? (status === 400 ? "invalid_request" : "internal_error"),
    message: status >= 500 ? "Unexpected gateway error." : error.message,
  }, requestId);
}

function routeParts(pathname) {
  return pathname.split("/").filter(Boolean);
}

export function createApp({
  clientRegistry = createClientRegistry(),
  auditLog = createMemoryAuditLog(),
  rateLimiter = createFixedWindowRateLimiter(),
  adminKey,
  requestIdFactory = () => randomUUID(),
} = {}) {
  const authenticator = createAuthenticator({ clientStore: clientRegistry, adminKey });

  function authenticate(headers, requestId, adminOnly = false) {
    const identity = authenticator.authenticate(headers);
    if (!identity) {
      return { error: reply(401, {
        error: "unauthorized",
        message: "Provide a valid API Key using x-api-key.",
      }, requestId, { "www-authenticate": 'ApiKey realm="api-developers"' }) };
    }
    if (adminOnly && identity.role !== "admin") {
      return { error: reply(403, {
        error: "forbidden",
        message: "Administrative API Key required.",
      }, requestId) };
    }
    return { identity };
  }

  function limited(identity, requestId, group) {
    const key = `${identity.role}:${identity.principal.id}:${group}`;
    const result = rateLimiter.consume(key);
    const headers = {
      "x-ratelimit-limit": String(result.limit),
      "x-ratelimit-remaining": String(result.remaining),
      "x-ratelimit-reset": String(Math.ceil(result.resetAt / 1000)),
    };
    if (!result.allowed) {
      return {
        error: reply(429, {
          error: "rate_limit_exceeded",
          message: "Request rate limit exceeded.",
        }, requestId, { ...headers, "retry-after": String(result.retryAfterSeconds) }),
      };
    }
    return { headers };
  }

  function audit(identity, action, resource, requestId, metadata = {}) {
    auditLog.append({
      actor: { type: identity.role, id: identity.principal.id },
      action,
      resource,
      requestId,
      metadata,
    });
  }

  return Object.freeze({
    async handleRequest({
      method = "GET",
      url = "/",
      headers = {},
      body,
      requestId = requestIdFactory(),
    } = {}) {
      const verb = method.toUpperCase();
      const parsedUrl = new URL(url, "http://localhost");
      const path = parsedUrl.pathname;
      const parts = routeParts(path);

      if ((path === "/health" || path === "/v1/health") && verb === "GET") {
        return reply(200, {
          status: "ok",
          service: "api-gateway",
          version: "0.2.0",
          storage: clientRegistry.repositoryKind,
        }, requestId);
      }
      if (path === "/v1" && verb === "GET") {
        return reply(200, {
          name: "API Developers.digital Platform",
          version: "v1",
          links: {
            catalog: "/v1/apis",
            openapi: "/openapi.json",
            developer: "/v1/me",
            clients: "/v1/admin/clients",
            audit: "/v1/admin/audit",
            health: "/health",
          },
        }, requestId);
      }
      if (path === "/v1/apis" && verb === "GET") {
        const data = listPublicApis();
        return reply(200, { data, meta: { count: data.length } }, requestId);
      }
      if (path === "/openapi.json" && verb === "GET") {
        return reply(200, getOpenApiDocument(), requestId);
      }

      if (path === "/v1/me" && verb === "GET") {
        const auth = authenticate(headers, requestId);
        if (auth.error) return auth.error;
        const limit = limited(auth.identity, requestId, "developer");
        if (limit.error) return limit.error;
        return reply(200, {
          data: { role: auth.identity.role, client: auth.identity.principal },
        }, requestId, limit.headers);
      }

      if (!path.startsWith("/v1/admin/")) {
        return reply(404, { error: "not_found", message: "Route not found." }, requestId);
      }

      const auth = authenticate(headers, requestId, true);
      if (auth.error) return auth.error;
      const limit = limited(auth.identity, requestId, "admin");
      if (limit.error) return limit.error;

      try {
        if (path === "/v1/admin/status" && verb === "GET") {
          return reply(200, {
            data: {
              storage: clientRegistry.repositoryKind,
              clients: clientRegistry.listClients().length,
            },
          }, requestId, limit.headers);
        }

        if (path === "/v1/admin/audit" && verb === "GET") {
          const entries = auditLog.list({ limit: parsedUrl.searchParams.get("limit") });
          return reply(200, { data: entries, meta: { count: entries.length } }, requestId, limit.headers);
        }

        if (path === "/v1/admin/clients") {
          if (verb === "GET") {
            const data = clientRegistry.listClients();
            return reply(200, { data, meta: { count: data.length } }, requestId, limit.headers);
          }
          if (verb === "POST") {
            const created = clientRegistry.createClient(parseBody(body));
            audit(auth.identity, "client.create", { type: "client", id: created.client.id }, requestId);
            return reply(201, {
              data: created.client,
              credentials: {
                apiKey: created.apiKey,
                key: created.key,
                keyId: created.key.id,
                warning: "Store this API Key now. It will not be returned again.",
              },
            }, requestId, { ...limit.headers, location: `/v1/admin/clients/${created.client.id}` });
          }
        }

        if (parts.length === 4 && parts.slice(0, 3).join("/") === "v1/admin/clients") {
          const clientId = decodeURIComponent(parts[3]);
          if (verb === "GET") {
            const client = clientRegistry.getClient(clientId);
            if (!client) return reply(404, { error: "client_not_found", message: "Client not found." }, requestId, limit.headers);
            return reply(200, { data: client }, requestId, limit.headers);
          }
          if (verb === "PATCH") {
            const payload = parseBody(body);
            const client = clientRegistry.updateClientStatus(clientId, payload.status);
            audit(auth.identity, "client.status.update", { type: "client", id: clientId }, requestId, { status: client.status });
            return reply(200, { data: client }, requestId, limit.headers);
          }
        }

        if (parts.length === 5 && parts.slice(0, 3).join("/") === "v1/admin/clients" && parts[4] === "keys" && verb === "POST") {
          const clientId = decodeURIComponent(parts[3]);
          const payload = parseBody(body);
          const rotated = clientRegistry.rotateApiKey(clientId, { revokeExisting: payload.revokeExisting === true });
          audit(auth.identity, "api_key.rotate", { type: "client", id: clientId }, requestId, {
            keyId: rotated.key.id,
            revokeExisting: payload.revokeExisting === true,
          });
          return reply(201, {
            data: rotated.client,
            credentials: {
              apiKey: rotated.apiKey,
              key: rotated.key,
              keyId: rotated.key.id,
              warning: "Store this API Key now. It will not be returned again.",
            },
          }, requestId, limit.headers);
        }

        if (parts.length === 6 && parts.slice(0, 3).join("/") === "v1/admin/clients" && parts[4] === "keys" && verb === "DELETE") {
          const clientId = decodeURIComponent(parts[3]);
          const keyId = decodeURIComponent(parts[5]);
          const revoked = clientRegistry.revokeApiKey(clientId, keyId);
          audit(auth.identity, "api_key.revoke", { type: "api_key", id: keyId }, requestId, { clientId, changed: revoked.changed });
          return reply(200, { data: revoked }, requestId, limit.headers);
        }

        return reply(405, {
          error: "method_not_allowed",
          message: "Method or administrative route not allowed.",
        }, requestId, { ...limit.headers, allow: "GET, POST, PATCH, DELETE" });
      } catch (error) {
        return { ...errorReply(error, requestId), headers: { ...errorReply(error, requestId).headers, ...limit.headers } };
      }
    },
  });
}

const defaultApp = createApp();
export const handleRequest = (request) => defaultApp.handleRequest(request);
