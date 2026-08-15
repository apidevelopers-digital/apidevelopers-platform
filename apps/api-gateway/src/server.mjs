import http from "node:http";
import { pathToFileURL } from "node:url";

import { createGatewayGlobalTrustAudit } from "./global-trust-audit.mjs";
import { createGatewayGlobalTrustTenantContext } from "./global-trust-context.mjs";
import { getOpenApiDocument } from "./openapi.mjs";
import { createReadinessService } from "./readiness.mjs";
import {
  createWebAgentConversationHttpRoute,
  webAgentConversationHttpPath,
} from "./web-agent-conversation-http.mjs";
import { resolveWebAgentShadowLazyManagedStartup } from "./web-agent-shadow-lazy-managed-startup.mjs";
import { createWebAgentServerBootstrap } from "./web-agent-shadow-server-bootstrap.mjs";

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
      ...(Array.isAsray(principal.scopes) ? { scopes: [...principal.scopes] } : {}),
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
  readiness = createReadinessService(),
  saasAccess,
} = {}) {
  if (
    authenticator !== undefined &&
    typeof authenticator?.authenticate !== "function"
  ) {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (
    saasAccess !== undefined &&
    typeof saasAccess?.evaluateAccess !== "function"
  ) {
    throw new TypeError("saasAccess.evaluateAccess must be a function");
  }
  if (typeof audit?.recordTenantContextIssued !== "function") {
    throw new TypeError("audit.recordTenantContextIssued must be a function");
  }
  if (typeof readiness?.check !== "function") {
    throw new TypeError("readiness.check must be a function");
  }

  return {
    async handleRequest({
      method = "GET",
      url = "/",
      headers = {},
    } = {}) {
      const normalizedMethod = String(method).toUpperCase();
      const requestUrl = new URL(String(url), "http://api-gateway.local");
      const pathname = requestUrl.pathname;

      if (normalizedMethod === "GET" && pathname === "/health") {
        return jsonResponse(200, {
          service: "api-gateway",
          status: "ok",
        });
      }

      if (normalizedMethod === "GET" && pathname === "/ready") {
        const report = await readiness.check();
        return jsonResponse(report.status === "ready" ? 200 : 503, report);
      }

      if (normalizedMethod === "GET" && pathname === "/openapi.json") {
        return jsonResponse(200, getOpenApiDocument());
      }

      if (normalizedMethod === "GET" && pathname === "/v1/saas/access") {
        if (!authenticator) {
          return jsonResponse(503, {
            allowed: false,
            reason: "authentication_unavailable",
          });
        }
        if (!saasAccess) {
          return jsonResponse(503, {
            allowed: false,
            reason: "saas_access_unavailable",
          });
        }

        const identity = await authenticator.authenticate(headers);
        if (!identity) {
          return jsonResponse(401, {
            allowed: false,
            reason: "unauthorized",
          });
        }

        const tenantId = identity?.principal?.tenantId;
        if (!tenantId) {
          return jsonResponse(403, {
            allowed: false,
            reason: "tenant_context_unavailable",
          });
        }

        const accessGrantId = requestUrl.searchParams.get("accessGrantId")?.trim();
        const workspaceId = requestUrl.searchParams.get("workspaceId")?.trim();
        const productId = requestUrl.searchParams.get("productId")?.trim();
        if (!accessGrantId || !workspaceId || !productId) {
          return jsonResponse(400, {
            allowed: false,
            reason: "access_context_required",
          });
        }

        const decision = await saasAccess.evaluateAccess({
          identity,
          accessGrantId,
          tenantId,
          workspaceId,
          productId,
        });

        return jsonResponse(decision.allowed ? 200 : 403, decision);
      }

      if (normalizedMethod === "GET" && pathname === "/v1/whoami") {
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
          correlationId:
            headers["x-correlation-id"] ?? headers["x-request-id"],
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

export function createHttpServer({
  app = createApp(),
  webAgentConversationRoute = createWebAgentConversationHttpRoute(),
} = {}) {
  if (
    typeof webAgentConversationRoute?.handle !== "function" ||
    typeof webAgentConversationRoute?.readBody !== "function"
  ) {
    throw new TypeError(
      "webAgentConversationRoute must provide handle and readBody",
    );
  }

  return http.createServer(async (request, response) => {
    try {
      const method = String(request.method ?? "GET").toUpperCase();
      const requestUrl = new URL(
        String(request.url ?? "/"),
        "http://api-gateway.local",
      );

      let result;
      if (
        method === "POST" &&
        requestUrl.pathname === webAgentConversationHttpPath
      ) {
        const body = await webAgentConversationRoute.readBody(request);
        result = await webAgentConversationRoute.handle({
          method,
          url: request.url,
          headers: request.headers,
          body,
        });
      } else {
        result = await app.handleRequest({
          method,
          url: request.url,
          headers: request.headers,
        });
      }

      response.writeHead(result.status, result.headers);
      response.end(result.body);
    } catch (error) {
      const transportStatus =
        Number.isInteger(error?.status) &&
        [400, 413, 415].includes(error.status)
          ? error.status
          : null;

      response.writeHead(transportStatus ?? 500, JSON_HEADERS);
      response.end(
        JSON.stringify(
          transportStatus
            ? {
                error:
                  typeof error?.code === "string"
                    ? error.code
                    : "invalid_request",
              }
            : {
                error: "internal_error",
                message:
                  error instanceof Error ? error.message : "Unknown error",
              },
        ),
      );
    }
  });
}

export async function startServer({
  port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? "127.0.0.1",
  env = process.env,
  app,
  webAgentConversationRoute,
  webAgentServerBootstrapOptions,
  resolveLazyManagedStartup = resolveWebAgentShadowLazyManagedStartup,
} = {}) {
  let selectedWebAgentRoute = webAgentConversationRoute;

  if (selectedWebAgentRoute === undefined) {
    let selectedBootstrapOptions = webAgentServerBootstrapOptions;

    if (selectedBootstrapOptions === undefined) {
      const lazyManagedStartup = await resolveLazyManagedStartup({ env });
      selectedBootstrapOptions =
        lazyManagedStartup?.webAgentServerBootstrapOptions;
    }

    const bootstrap = createWebAgentServerBootstrap({
      env,
      ...(selectedBootstrapOptions ?? {}),
    });
    selectedWebAgentRoute = bootstrap.route;
  }

  const server = createHttpServer({
    app,
    webAgentConversationRoute: selectedWebAgentRoute,
  });

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
