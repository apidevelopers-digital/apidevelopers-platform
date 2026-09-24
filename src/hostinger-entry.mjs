import crypto from "node:crypto";

import { startOperationalHttpServer } from "./operational-http-transport.mjs";
import { createOperatorSecretHandoffOperationalComposition } from "./operator-secret-handoff-operational-composition.mjs";
import { createOperatorHostingerMysqlStagingHandoffHttpApp } from "./operator-hostinger-mysql-staging-handoff-http.mjs";

function now() {
  return new Date().toISOString();
}

function configured(value) {
  return Boolean(String(value ?? "").trim());
}

function readBearer(headers = {}) {
  const authorization = String(headers.authorization ?? headers.Authorization ?? "");
  return authorization.replace(/^Bearer\s+/i, "").trim();
}

function timingSafeEquals(left, right) {
  const a = Buffer.from(String(left ?? ""));
  const b = Buffer.from(String(right ?? ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createJsonResponse(status, payload) {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type": "nosniff",
    }),
    body: JSON.stringify(payload),
  });
}

function createTerminalApp() {
  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const path = new URL(String(request.url ?? "/"), "https://api-gateway.local").pathname;

      if (method === "GET" && (path === "/" || path === "/health" || path === "/v1/health")) {
        return createJsonResponse(200, {
          ok: true,
          release: "hostinger-minimal-secret-handoff-runtime-v1",
          timestamp: now(),
        });
      }

      return createJsonResponse(404, {
        ok: false,
        error: "not_found",
        release: "hostinger-minimal-secret-handoff-runtime-v1",
        timestamp: now(),
      });
    },
  });
}

function createAdminAuthenticator(env = process.env) {
  return Object.freeze({
    async authenticate(headers = {}) {
      const expected = String(env.API_GATEWAY_ADMIN_KEY ?? "").trim();
      if (!eppected) return null;

      const token = readBearer(headers);
      if (!token || !timingSafeEquals(token, expected)) return null;

      return Object.freeze({
        principal: Object.freeze({
          id: "hostinger-admin",
          type: "operator",
          scopes: Object.freeze(["admin:*"]),
        }),
      });
    },
  });
}

function createAdminAuthorization() {
  return Object.freeze({
    decide({ identity, requiredScopes = [] } = {}) {
      const scopes = identity?.principal?.scopes;
      const hasAdmin = Array.isArray(scopes) && scopes.includes("admin:*");
      const requiresAdmin = !Array.isArray(requiredScopes) || requiredScopes.length === 0 || requiredScopes.includes("admin:*");

      return Object.freeze({
        effect: hasAdmin && requiresAdmin ? "allow" : "deny",
      });
    },
  });
}

function parsePort(value) {
  const port = Number(String(value ?? "3000").trim());
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new TypeError("PORT must be an integer between 0 and 65535");
  }
  return port;
}

function registerShutdown(server, processRef = process) {
  const shutdown = (signal) => {
    server.close(() => {
      console.log(JSON.stringify({
        event: "api_gateway_hostinger_minimal_stopped",
        signal,
        timestamp: now(),
      }));
      processRef.exit(0);
    });
  };

  processRef.once("SIGINT", shutdown);
  processRef.once("SIGTERM", shutdown);
  return shutdown;
}

const env = process.env;
const authenticator = createAdminAuthenticator(env);
const authorization = createAdminAuthorization();
const terminalApp = createTerminalApp();

const secretHandoffComposition = createOperatorSecretHandoffOperationalComposition({
  app: terminalApp,
  authenticator,
  authorization,
  runtimeDescriptor: Object.freeze({
    adminKeyConfigured: configured(env.API_GATEWAY_ADMIN_KEY),
  }),
  env,
});

if (!secretHandoffComposition.enabled) {
  throw new Error("secret_handoff_runtime_disabled");
}

const app = createOperatorHostingerMysqlStagingHandoffHttpApp({
  app: terminalApp,
  authenticator,
  authorization,
  handoffService: secretHandoffComposition.handoffService,
  secretProvider: secretHandoffComposition.secretProvider,
  env,
});

const server = await startOperationalHttpServer({
  app,
  host: String(env.HOST ?? "127.0.0.1"),
  port: parsePort(env.PORT),
  secretHandoffHttpApp: secretHandoffComposition.httpApp,
});

console.log(JSON.stringify({
  event: "api_gateway_hostinger_minimal_started",
  release: "hostinger-minimal-secret-handoff-runtime-v1",
  host: server.address()?.address,
  port: server.address()?.port,
  secretHandoffEnabled: true,
  mysqlHandoffEnabled: true,
  timestamp: now(),
}));

registerShutdown(server);
