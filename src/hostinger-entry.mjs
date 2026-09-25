import { readFileSync } from "node:fs";
import crypto from "node:crypto";

import {
  createApiKeyLifecycleService,
  createDurableApiKeyRepository,
} from "@apidevelopers/apikey-core";
import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { startOperationalHttpServer } from "./operational-http-transport.mjs";
import { createOperatorSecretHandoffOperationalComposition } from "./operator-secret-handoff-operational-composition.mjs";
import { createOperatorHostingerMysqlStagingHandoffHttpApp } from "./operator-hostinger-mysql-staging-handoff-http.mjs";
import { resolveHostingerRuntimeEnv } from "./hostinger-runtime-env.mjs";
import { createUniCoPreviewLoginComposition } from "./web-agent-preview-login-composition.mjs";
import { createUniAccountPreviewRuntimeComposition } from "./uni-account-preview-runtime-composition.mjs";
import { createGatewayAuthenticator } from "./auth-composition.mjs";
import { createAdaMitraBridgeReadOnly } from "./ada-mitra-bridge-readonly.mjs";
import { createOperatorApiKeyProvisioningRuntimeApp } from "./operator-api-key-provisioning-composition.mjs";
import { createOperatorApiKeyProvisioningWrapper } from "./operator-api-key-provisioning-wrapper.mjs";

function now() { return new Date().toISOString(); }
function configured(value) { return Boolean(String(value ?? "").trim()); }
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
          release: "hostinger-minimal-secret-handoff-account-runtime-v2",
          timestamp: now(),
        });
      }
      return createJsonResponse(404, {
        ok: false,
        error: "not_found",
        release: "hostinger-minimal-secret-handoff-account-runtime-v2",
        timestamp: now(),
      });
    },
  });
}
function createAdminAuthenticator(env = process.env) {
  return Object.freeze({
    async authenticate(headers = {}) {
      const expected = String(env.API_GATEWAY_ADMIN_KEY ?? "").trim();
      if (!expected) return null;
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
      return Object.freeze({ effect: hasAdmin && requiresAdmin ? "allow" : "deny" });
    },
  });
}
function createAdaMitraBridgeApp({ app, authenticator }) {
  const bridge = createAdaMitraBridgeReadOnly({ authenticator });
  return Object.freeze({
    async handleRequest(request = {}) {
      const bridgeResponse = await bridge.handleRequest(request);
      if (bridgeResponse !== null) return bridgeResponse;
      return app.handleRequest(request);
    },
  });
}
function createGatewayKeyProvisionerApp({ app, authenticator, apiKeyLifecycle }) {
  const operatorApiKeyProvisioningApp = createOperatorApiKeyProvisioningRuntimeApp({
    authenticator,
    apiKeyLifecycle,
  });
  return createOperatorApiKeyProvisioningWrapper({
    app,
    operatorApiKeyProvisioningApp,
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

const env = resolveHostingerRuntimeEnv(process.env, { readFileFn: readFileSync });
const store = createJsonFileStore({ filePath: env.API_GATEWAY_STATE_FILE });
const apiKeyRepository = createDurableApiKeyRepository({ store });
const apiKeyLifecycle = createApiKeyLifecycleService({ repository: apiKeyRepository });
const adaMitraAuthenticator = createGatewayAuthenticator({
  apiKeyRepository,
  adminKey: env.API_GATEWAY_ADMIN_KEY,
  adminPrincipal: Object.freeze({
    id: "hostinger-admin",
    type: "operator",
    scopes: Object.freeze(["admin:*"]),
  }),
});
const authenticator = createAdminAuthenticator(env);
const authorization = createAdminAuthorization();
const terminalApp = createTerminalApp();

const secretHandoffComposition = createOperatorSecretHandoffOperationalComposition({
  app: terminalApp,
  authenticator,
  authorization,
  runtimeDescriptor: Object.freeze({
    adminKeyConfigured: configured(env.API_GATEWAY_ADMIN_KEY),
    adaMitraBridgeReadOnlyEnabled: true,
    gatewayKeyProvisionerEnabled: true,
  }),
  env,
});
if (!secretHandoffComposition.enabled) throw new Error("secret_handoff_runtime_disabled");

const mysqlApp = createOperatorHostingerMysqlStagingHandoffHttpApp({
  app: terminalApp,
  authenticator,
  authorization,
  handoffService: secretHandoffComposition.handoffService,
  secretProvider: secretHandoffComposition.secretProvider,
  env,
});

const login = createUniCoPreviewLoginComposition({
  app: mysqlApp,
  store,
  identityBackendBaseUrl: env.UNI_CO_PREVIEW_IDENTITY_BACKEND_BASE_URL,
});
if (!login.enabled || !login.bootstrap) throw new Error("uni_account_preview_login_disabled");

const account = createUniAccountPreviewRuntimeComposition({
  app: login.app,
  store,
  loginBootstrap: login.bootstrap,
  redeemerAuthorization: env.UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION,
  enabled: true,
});
if (!account.enabled) throw new Error("uni_account_preview_runtime_disabled");

const provisionerApp = createGatewayKeyProvisionerApp({
  app: account.app,
  authenticator: adaMitraAuthenticator,
  apiKeyLifecycle,
});

const app = createAdaMitraBridgeApp({
  app: provisionerApp,
  authenticator: adaMitraAuthenticator,
});

const server = await startOperationalHttpServer({
  app,
  host: String(env.HOST ?? "127.0.0.1"),
  port: parsePort(env.PORT),
  secretHandoffHttpApp: secretHandoffComposition.httpApp,
});

console.log(JSON.stringify({
  event: "api_gateway_hostinger_minimal_started",
  release: "hostinger-minimal-secret-handoff-account-runtime-v2",
  host: server.address()?.address,
  port: server.address()?.port,
  secretHandoffEnabled: true,
  mysqlHandoffEnabled: true,
  uniAccountPreviewEnabled: true,
  adaMitraBridgeReadOnlyEnabled: true,
  gatewayKeyProvisionerEnabled: true,
  timestamp: now(),
}));
registerShutdown(server);
