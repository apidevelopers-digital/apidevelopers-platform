import http from "node:http";
import { pathToFileURL } from "node:url";

import { createGatewayGlobalTrustAudit } from "./global-trust-audit.mjs";
import { createGatewayGlobalTrustTenantContext } from "./global-trust-context.mjs";
import { getOpenApiDocument } from "./openapi.mjs";
import {
  RadarSignalConflictError,
  RadarSignalValidationError,
  parseAndValidateRadarSignalEvent,
} from "./radar-signal-event.mjs";
import { createReadinessService } from "./readiness.mjs";

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
});
const RADAR_HEALTH_ORIGINS = Object.freeze(new Set([
  "https://radar.apidevelopers.digital",
  "https://radar-preview.apidevelopers.digital",
]));
const MAX_BODY_BYTES = 64 * 1024;

class RequestTransportError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "RequestTransportError";
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(status, payload, headers = JSON_HEADERS) {
  return {
    status,
    headers,
    body: JSON.stringify(payload),
  };
}

function healthHeaders(origin) {
  const normalizedOrigin = String(origin ?? "").trim();
  if (!RADAR_HEALTH_ORIGINS.has(normalizedOrigin)) return JSON_HEADERS;

  return Object.freeze({
    ...JSON_HEADERS,
    "access-control-allow-origin": normalizedOrigin,
    vary: "Origin",
  });
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

function hasScope(identity, scope) {
  const scopes = identity?.principal?.scopes;
  return Array.isArray(scopes) && scopes.includes(scope);
}

async function readBody(request, maxBytes = MAX_BODY_BYTES) {
  const method = String(request.method ?? "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH"].includes(method)) return undefined;

  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestTransportError(413, "payload_too_large");
  }

  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new RequestTransportError(413, "payload_too_large");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks).toString("utf8");
}

export function createApp({
  authenticator,
  audit = createGatewayGlobalTrustAudit(),
  readiness = createReadinessService(),
  saasAccess,
  radarEvents,
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
  if (
    radarEvents !== undefined &&
    typeof radarEvents?.ingest !== "function"
  ) {
    throw new TypeError("radarEvents.ingest must be a function");
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
      body,
    } = {}) {
      const normalizedMethod = String(method).toUpperCase();
      const requestUrl = new URL(String(url), "http://api-gateway.local");
      const pathname = requestUrl.pathname;

      if (normalizedMethod === "GET" && pathname === "/health") {
        return jsonResponse(
          200,
          {
            service: "api-gateway",
            status: "ok",
          },
          healthHeaders(headers.origin),
        );
      }

      if (normalizedMethod === "GET" && pathname === "/ready") {
        const report = await readiness.check();
        return jsonResponse(report.status === "ready" ? 200 : 503, report);
      }

      if (normalizedMethod === "GET" && pathname === "/openapi.json") {
        return jsonResponse(200, getOpenApiDocument());
      }

      if (normalizedMethod === "POST" && pathname === "/v1/radar/events") {
        if (!authenticator) {
          return jsonResponse(503, {
            accepted: false,
            reason: "authentication_unavailable",
          });
        }
        if (!radarEvents) {
          return jsonResponse(503, {
            accepted: false,
            reason: "radar_ingestion_unavailable",
          });
        }

        const identity = await authenticator.authenticate(headers);
        if (!identity) {
          return jsonResponse(401, {
            accepted: false,
            reason: "unauthorized",
          });
        }

        const tenantId = identity?.principal?.tenantId;
        if (!tenantId) {
          return jsonResponse(403, {
            accepted: false,
            reason: "tenant_context_unavailable",
          });
        }

        if (!hasScope(identity, "radar:events:write")) {
          return jsonResponse(403, {
            accepted: false,
            reason: "insufficient_scope",
          });
        }

        try {
          const event = parseAndValidateRadarSignalEvent(body, { tenantId });
          const result = await radarEvents.ingest(event);

          return jsonResponse(result.duplicate ? 200 : 202, {
            ...result,
            mode: "shadow",
            outboundTriggered: false,
          });
        } catch (error) {
          if (error instanceof RadarSignalValidationError) {
            const status = error.code === "tenant_mismatch" ? 403 : 400;
            return jsonResponse(status, {
              accepted: false,
              reason: error.code,
              field: error.field,
            });
          }
          if (error instanceof RadarSignalConflictError) {
            return jsonResponse(409, {
              accepted: false,
              reason: error.code,
            });
          }
          throw error;
        }
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
  maxBodyBytes = MAX_BODY_BYTES,
} = {}) {
  return http.createServer(async (request, response) => {
    try {
      const body = await readBody(request, maxBodyBytes);
      const result = await app.handleRequest({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });

      response.writeHead(result.status, result.headers);
      response.end(result.body);
    } catch (error) {
      if (error instanceof RequestTransportError) {
        response.writeHead(error.status, JSON_HEADERS);
        response.end(JSON.stringify({ error: error.code }));
        return;
      }

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
  maxBodyBytes,
} = {}) {
  const server = createHttpServer({ app, maxBodyBytes });

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
