import http from "node:http";
import { pathToFileURL } from "node:url";

import { createGatewayGlobalTrustAudit } from "./global-trust-audit.mjs";
import { createGatewayGlobalTrustTenantContext } from "./global-trust-context.mjs";
import { getOpenApiDocument } from "./openapi.mjs";

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
});

function jsonResponse(status, payload) {
  return {
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function toPublicIdentity(identity) {
  if (!identity || typeof identity !== "object") return null;

  const principal = identity.principal ?? {};
  return Object.freeze({
    role: identity.role,
    principal: Object.freeze({
      ...(principal.id !== undefined ? { id: principal.id } : {}),
      ...(principal.tenantId !== undefined ? { tenantId: principal.tenantId } : {}),
      ...(principal.name !== undefined ? { name: principal.name } : {}),
      ...(principal.status !== undefined ? { status: principal.status } : {}),
      ...(Array.isArray(principal.scopes) ? { scopes: [...principal.scopes] } : {}),
      ...(principal.prefix !== undefined ? { prefix: principal.prefix } : {}),
    }),
  });
}

function toGatewayTenantContext(identity, headers) {
  const principal = identity?.principal;
  if (!principal?.tenantId) return null;

  return createGatewayGlobalTrustTenantContext({
    tenantId: principal.tenantId,
    region: headers["x-region"] ?? "global",
    scopes: Array.isArray(principal.scopes) ? principal.scopes : [],
  });
}

export function createApp({
  authenticator,
  audit = createGatewayGlobalTrustAudit(),
} = {}) {
  if (
    authenticator !== undefined &&
    typeof authenticator?.authenticate !== "function"
  ) {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (typeof audit?.recordTenantContextIssued !== "function") {
    throw new TypeError("audit.recordTenantContextIssued must be a function");
  }

  return {
    async handleRequest({
      method = "GET",
      url = "/",
      headers = {},
    } = {}) {
      const normalizedMethod = String(method).toUpperCase();

      if (normalizedMethod === "GET" && url === "/health") {
        return jsonResponse(200, {
          service: "api-gateway",
          status: "ok",
        });
      }

      if (normalizedMethod === "GET" && url === "/openapi.json") {
        return jsonResponse(200, getOpenApiDocument());
      }

      if (normalizedMethod === "GET" && url === "/v1/whoami") {
        if (!authenticator) {
          return jsonResponse(503, {
            error: "authentication_unavailable",
          });
        }

        const identity = await authenticator.authenticate(headers);
        if (!identity) {
          return jsonResponse(401, {
            error: "unauthorized",
          });
        }

        const tenantContext = toGatewayTenantContext(identity, headers);
        if (!tenantContext) {
          return jsonResponse(403, {
            error: "tenant_context_unavailable",
          });
        }

        await audit.recordTenantContextIssued({
          identity,
          tenantContext,
          method: normalizedMethod,
          url,
          correlationId: headers["x-correlation-id"] ?? headers["x-request-id"],
        });

        return jsonResponse(200, {
          identity: toPublicIdentity(identity),
          tenantContext,
        });
      }

      return jsonResponse(404, {
        error: "not_found",
      });
    },
  };
}

export function createHttpServer({ app = createApp() } = {}) {
  return http.createServer(async (request, response) => {
    try {
      const result = await app.handleRequest({
        method: request.method,
        url: request.url,
        headers: request.headers,
      });

      response.writeHead(result.status, result.headers);
      response.end(result.body);
    } catch (error) {
      response.writeHead(500, JSON_HEADERS);
      response.end(
        JSON.stringify({
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  });
}

export async function startServer({
  port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? "127.0.0.1",
  app,
} = {}) {
  const server = createHttpServer({ app });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  return server;
}

async function main() {
  const server = await startServer();
  const address = server.address();

  console.log(
    JSON.stringify({
      event: "api_gateway_started",
      host: address.address,
      port: address.port,
    }),
  );

  const shutdown = (signal) => {
    server.close(() => {
      console.log(JSON.stringify({ event: "api_gateway_stopped", signal }));
      process.exit(0);
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        event: "api_gateway_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    process.exitCode = 1;
  });
}
