import { randomUUID } from "node:crypto";

import { authorize } from "@apidevelopers/auth-core";
import {
  PlatformError,
  createJsonResponse,
  createRequestContext,
  toErrorResponse,
} from "@apidevelopers/platform-core";

import { listPublicApis } from "./catalog.mjs";
import { createMemoryAuditLog } from "./audit-log.mjs";
import { createClientRegistry } from "./client-registry.mjs";
import { getOpenApiDocument } from "./openapi.mjs";
import { createFixedWindowRateLimiter } from "./rate-limit.mjs";
import { createAuthenticator } from "./security.mjs";

const ADMIN_SCOPES = Object.freeze({
  STATUS_READ: "admin:status:read",
  AUDIT_READ: "admin:audit:read",
  CLIENTS_READ: "admin:clients:read",
  CLIENTS_WRITE: "admin:clients:write",
  KEYS_WRITE: "admin:keys:write",
});

function parseBody(body) {
  if (body == null || body === "") return {};
  if (typeof body === "object" && !Buffer.isBuffer(body)) return body;

  try {
    return JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : body);
  } catch (cause) {
    throw new PlatformError(
      "invalid_json",
      "Request body must contain valid JSON.",
      {
        status: 400,
        cause,
      },
    );
  }
}

function routeParts(path) {
  return path.split("/").filter(Boolean);
}

export function createApp({
  clientRegistry = createClientRegistry(),
  auditLog = createMemoryAuditLog(),
  rateLimiter = createFixedWindowRateLimiter(),
  adminKey,
  requestIdFactory = randomUUID,
  contextFactory = createRequestContext,
  authorizer = authorize,
} = {}) {
  const authenticator = createAuthenticator({
    clientStore: clientRegistry,
    adminKey,
  });

  const makeContext = (request) =>
    request.context ??
    contextFactory(request, {
      idFactory: requestIdFactory,
    });

  const reply = (status, payload, context, headers = {}) =>
    createJsonResponse(status, payload, context, { headers });

  function authenticate(headers, context, adminOnly = false) {
    const identity = authenticator.authenticate(headers);
    if (!identity) {
      return {
        error: reply(
          401,
          {
            error: "unauthorized",
            message: "Provide a valid API Key using x-api-key.",
          },
          context,
          { "www-authenticate": 'ApiKey realm="api-developers"' },
        ),
      };
    }

    if (adminOnly && identity.role !== "admin") {
      return {
        error: reply(
          403,
          {
            error: "forbidden",
            message: "Administrative API Key required.",
          },
          context,
        ),
      };
    }

    return { identity };
  }

  function requireScopes(identity, context, scopes, headers = {}) {
    const decision = authorizer(identity, {
      roles: ["admin"],
      scopes,
    });

    if (decision.allowed) return null;

    return reply(
      403,
      {
        error: "insufficient_scope",
        message: "The authenticated identity does not have the required scope.",
        details: {
          requiredScopes: scopes,
          missingScopes: decision.missingScopes ?? scopes,
        },
      },
      context,
      headers,
    );
  }

  function limited(identity, context, group) {
    const key = `${identity.role}:${identity.principal.id}:${group}`;
    const result = rateLimiter.consume(key);
    const headers = {
      "x-ratelimit-limit": String(result.limit),
      "x-ratelimit-remaining": String(result.remaining),
      "x-ratelimit-reset": String(Math.ceil(result.resetAt / 1000)),
    };

    if (!result.allowed) {
      return {
        error: reply(
          429,
          {
            error: "rate_limit_exceeded",
            message: "Request rate limit exceeded.",
          },
          context,
          { ...headers, "retry-after": String(result.retryAfterSeconds) },
        ),
      };
    }

    return { headers };
  }

  function audit(identity, action, resource, context, metadata = {}) {
    auditLog.append({
      actor: { type: identity.role, id: identity.principal.id },
      action,
      resource,
      requestId: context.requestId,
      metadata,
    });
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const context = makeContext(request);
      const { method: verb, path, query } = context;
      const headers = context.headers;
      const parts = routeParts(path);

      if ((path === "/health" || path === "/v1/health") && verb === "GET") {
        return reply(
          200,
          {
            status: "ok",
            service: "api-gateway",
            version: "0.3.0",
            storage: clientRegistry.repositoryKind,
          },
          context,
        );
      }

      if (path === "/v1" && verb === "GET") {
        return reply(
          200,
          {
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
          },
          context,
        );
      }

      if (path === "/v1/apis" && verb === "GET") {
        const data = listPublicApis();
        return reply(200, { data, meta: { count: data.length } }, context);
      }

      if (path === "/openapi.json" && verb === "GET") {
        return reply(200, getOpenApiDocument(), context);
      }

      if (path === "/v1/me" && verb === "GET") {
        const auth = authenticate(headers, context);
        if (auth.error) return auth.error;
        const rate = limited(auth.identity, context, "developer");
        if (rate.error) return rate.error;

        return reply(
          200,
          {
            data: {
              role: auth.identity.role,
              client: auth.identity.principal,
            },
          },
          context,
          rate.headers,
        );
      }

      if (!path.startsWith("/v1/admin/")) {
        return reply(
          404,
          { error: "not_found", message: "Route not found." },
          context,
        );
      }

      const auth = authenticate(headers, context, true);
      if (auth.error) return auth.error;
      const rate = limited(auth.identity, context, "admin");
      if (rate.error) return rate.error;

      try {
        if (path === "/v1/admin/status" && verb === "GET") {
          const forbidden = requireScopes(
            auth.identity,
            context,
            [ADMIN_SCOPES.STATUS_READ],
            rate.headers,
          );
          if (forbidden) return forbidden;

          return reply(
            200,
            {
              data: {
                storage: clientRegistry.repositoryKind,
                clients: clientRegistry.listClients().length,
              },
            },
            context,
            rate.headers,
          );
        }

        if (path === "/v1/admin/audit" && verb === "GET") {
          const forbidden = requireScopes(
            auth.identity,
            context,
            [ADMIN_SCOPES.AUDIT_READ],
            rate.headers,
          );
          if (forbidden) return forbidden;

          const entries = auditLog.list({ limit: query.limit });
          return reply(
            200,
            { data: entries, meta: { count: entries.length } },
            context,
            rate.headers,
          );
        }

        if (path === "/v1/admin/clients") {
          if (verb === "GET") {
            const forbidden = requireScopes(
              auth.identity,
              context,
              [ADMIN_SCOPES.CLIENTS_READ],
              rate.headers,
            );
            if (forbidden) return forbidden;

            const data = clientRegistry.listClients();
            return reply(
              200,
              { data, meta: { count: data.length } },
              context,
              rate.headers,
            );
          }

          if (verb === "POST") {
            const forbidden = requireScopes(
              auth.identity,
              context,
              [ADMIN_SCOPES.CLIENTS_WRITE],
              rate.headers,
            );
            if (forbidden) return forbidden;

            const created = clientRegistry.createClient(parseBody(request.body));
            audit(
              auth.identity,
              "client.create",
              { type: "client", id: created.client.id },
              context,
            );
            return reply(
              201,
              {
                data: created.client,
                credentials: {
                  apiKey: created.apiKey,
                  key: created.key,
                  keyId: created.key.id,
                  warning:
                    "Store this API Key now. It will not be returned again.",
                },
              },
              context,
              {
                ...rate.headers,
                location: `/v1/admin/clients/${created.client.id}`,
              },
            );
          }
        }

        if (
          parts.length === 4 &&
          parts.slice(0, 3).join("/") === "v1/admin/clients"
        ) {
          const clientId = decodeURIComponent(parts[3]);

          if (verb === "GET") {
            const forbidden = requireScopes(
              auth.identity,
              context,
              [ADMIN_SCOPES.CLIENTS_READ],
              rate.headers,
            );
            if (forbidden) return forbidden;

            const client = clientRegistry.getClient(clientId);
            if (!client) {
              throw new PlatformError(
                "client_not_found",
                "Client not found.",
                { status: 404 },
              );
            }
            return reply(200, { data: client }, context, rate.headers);
          }

          if (verb === "PATCH") {
            const forbidden = requireScopes(
              auth.identity,
              context,
              [ADMIN_SCOPES.CLIENTS_WRITE],
              rate.headers,
            );
            if (forbidden) return forbidden;

            const payload = parseBody(request.body);
            const client = clientRegistry.updateClientStatus(
              clientId,
              payload.status,
            );
            audit(
              auth.identity,
              "client.status.update",
              { type: "client", id: clientId },
              context,
              { status: client.status },
            );
            return reply(200, { data: client }, context, rate.headers);
          }
        }

        if (
          parts.length === 5 &&
          parts.slice(0, 3).join("/") === "v1/admin/clients" &&
          parts[4] === "keys" &&
          verb === "POST"
        ) {
          const forbidden = requireScopes(
            auth.identity,
            context,
            [ADMIN_SCOPES.KEYS_WRITE],
            rate.headers,
          );
          if (forbidden) return forbidden;

          const clientId = decodeURIComponent(parts[3]);
          const payload = parseBody(request.body);
          const rotated = clientRegistry.rotateApiKey(clientId, {
            revokeExisting: payload.revokeExisting === true,
          });
          audit(
            auth.identity,
            "api_key.rotate",
            { type: "client", id: clientId },
            context,
            {
              keyId: rotated.key.id,
              revokeExisting: payload.revokeExisting === true,
            },
          );
          return reply(
            201,
            {
              data: rotated.client,
              credentials: {
                apiKey: rotated.apiKey,
                key: rotated.key,
                keyId: rotated.key.id,
                warning:
                  "Store this API Key now. It will not be returned again.",
              },
            },
            context,
            rate.headers,
          );
        }

        if (
          parts.length === 6 &&
          parts.slice(0, 3).join("/") === "v1/admin/clients" &&
          parts[4] === "keys" &&
          verb === "DELETE"
        ) {
          const forbidden = requireScopes(
            auth.identity,
            context,
            [ADMIN_SCOPES.KEYS_WRITE],
            rate.headers,
          );
          if (forbidden) return forbidden;

          const clientId = decodeURIComponent(parts[3]);
          const keyId = decodeURIComponent(parts[5]);
          const revoked = clientRegistry.revokeApiKey(clientId, keyId);
          audit(
            auth.identity,
            "api_key.revoke",
            { type: "api_key", id: keyId },
            context,
            { clientId, changed: revoked.changed },
          );
          return reply(200, { data: revoked }, context, rate.headers);
        }

        return reply(
          405,
          {
            error: "method_not_allowed",
            message: "Method or administrative route not allowed.",
          },
          context,
          { ...rate.headers, allow: "GET, POST, PATCH, DELETE" },
        );
      } catch (error) {
        return toErrorResponse(error, context, { headers: rate.headers });
      }
    },
  });
}

const defaultApp = createApp();
export const handleRequest = (request) => defaultApp.handleRequest(request);
