import { randomUUID } from "node:crypto";
import { listPublicApis } from "./catalog.mjs";
import { createClientStore } from "./client-store.mjs";
import { getOpenApiDocument } from "./openapi.mjs";
import { createAuthenticator } from "./security.mjs";

const BASE_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
});

function response(status, body, requestId, headers = {}) {
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

function methodNotAllowed(requestId, allowed) {
  return response(
    405,
    { error: "method_not_allowed", message: `Allowed methods: ${allowed.join(", ")}` },
    requestId,
    { allow: allowed.join(", ") },
  );
}

export function createApp({
  clientStore = createClientStore(),
  adminKey,
  requestIdFactory = () => randomUUID(),
} = {}) {
  const authenticator = createAuthenticator({ clientStore, adminKey });

  function requireAuthentication(headers, requestId) {
    const identity = authenticator.authenticate(headers);
    if (identity) return { identity };

    return {
      error: response(
        401,
        {
          error: "unauthorized",
          message: "Provide a valid API Key using the x-api-key header.",
        },
        requestId,
        { "www-authenticate": 'ApiKey realm="api-developers"' },
      ),
    };
  }

  function requireAdmin(headers, requestId) {
    const auth = requireAuthentication(headers, requestId);
    if (auth.error) return auth;

    if (auth.identity.role !== "admin") {
      return {
        error: response(
          403,
          {
            error: "forbidden",
            message: "Administrative API Key required.",
          },
          requestId,
        ),
      };
    }

    return auth;
  }

  return Object.freeze({
    async handleRequest({
      method = "GET",
      url = "/",
      headers = {},
      body,
      requestId = requestIdFactory(),
    } = {}) {
      const normalizedMethod = method.toUpperCase();
      const pathname = new URL(url, "http://localhost").pathname;

      if (pathname === "/health" || pathname === "/v1/health") {
        if (normalizedMethod !== "GET") return methodNotAllowed(requestId, ["GET"]);
        return response(200, {
          status: "ok",
          service: "api-gateway",
          version: "0.1.0",
        }, requestId);
      }

      if (pathname === "/v1") {
        if (normalizedMethod !== "GET") return methodNotAllowed(requestId, ["GET"]);
        return response(200, {
          name: "API Developers.digital Platform",
          version: "v1",
          links: {
            catalog: "/v1/apis",
            openapi: "/openapi.json",
            developer: "/v1/me",
            clients: "/v1/admin/clients",
            health: "/health",
          },
        }, requestId);
      }

      if (pathname === "/v1/apis") {
        if (normalizedMethod !== "GET") return methodNotAllowed(requestId, ["GET"]);
        const catalog = listPublicApis();
        return response(200, {
          data: catalog,
          meta: { count: catalog.length },
        }, requestId);
      }

      if (pathname === "/openapi.json") {
        if (normalizedMethod !== "GET") return methodNotAllowed(requestId, ["GET"]);
        return response(200, getOpenApiDocument(), requestId);
      }

      if (pathname === "/v1/me") {
        if (normalizedMethod !== "GET") return methodNotAllowed(requestId, ["GET"]);
        const auth = requireAuthentication(headers, requestId);
        if (auth.error) return auth.error;

        return response(200, {
          data: {
            role: auth.identity.role,
            client: auth.identity.principal,
          },
        }, requestId);
      }

      if (pathname === "/v1/admin/clients") {
        const auth = requireAdmin(headers, requestId);
        if (auth.error) return auth.error;

        if (normalizedMethod === "GET") {
          const clients = clientStore.listClients();
          return response(200, {
            data: clients,
            meta: { count: clients.length },
          }, requestId);
        }

        if (normalizedMethod === "POST") {
          let payload;
          try {
            payload = parseBody(body);
          } catch {
            return response(400, {
              error: "invalid_json",
              message: "Request body must contain valid JSON.",
            }, requestId);
          }

          try {
            const created = clientStore.createClient(payload);
            return response(201, {
              data: created.client,
              credentials: {
                apiKey: created.apiKey,
                warning: "Store this API Key now. It will not be returned again.",
              },
            }, requestId, { location: `/v1/admin/clients/${created.client.id}` });
          } catch (error) {
            return response(400, {
              error: "invalid_client",
              message: error.message,
            }, requestId);
          }
        }

        return methodNotAllowed(requestId, ["GET", "POST"]);
      }

      return response(404, {
        error: "not_found",
        message: "Route not found.",
      }, requestId);
    },
  });
}

const defaultApp = createApp();

export async function handleRequest(request) {
  return defaultApp.handleRequest(request);
}
