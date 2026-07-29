import { createOperationalGateway } from "./operational-composition.mjs";
import { createReadinessService } from "./readiness.mjs";

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

function requireStore(store) {
  if (typeof store?.read !== "function") {
    throw new TypeError("store.read must be a function");
  }
  return store;
}

function requireApp(app) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  return app;
}

export function createPersistenceReadinessCheck({
  store,
  name = "persistence",
  critical = true,
} = {}) {
  const operationalStore = requireStore(store);
  const normalizedName = String(name ?? "").trim();
  if (!normalizedName) throw new TypeError("name is required");

  return Object.freeze({
    name: normalizedName,
    critical: critical !== false,
    async run() {
      const state = await operationalStore.read();
      if (!Number.isSafeInteger(state?.revision) || state.revision < 0) {
        return { status: "error", code: "invalid_revision" };
      }
      return { status: "ok", code: "readable" };
    },
  });
}

export function createOperationalReadinessService({
  store,
  checks = [],
  now,
} = {}) {
  if (!Array.isArray(checks)) {
    throw new TypeError("checks must be an array");
  }

  return createReadinessService({
    checks: [
      createPersistenceReadinessCheck({ store }),
      ...checks,
    ],
    ...(now ? { now } : {}),
  });
}

export function createReadinessHttpApp({ app, readiness } = {}) {
  const downstream = requireApp(app);
  if (typeof readiness?.check !== "function") {
    throw new TypeError("readiness.check must be a function");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      if (method === "GET" && request.url === "/ready") {
        const report = await readiness.check();
        return jsonResponse(report.status === "ready" ? 200 : 503, report);
      }
      return downstream.handleRequest(request);
    },
  });
}

export function createOperationalGatewayWithReadiness({
  readinessChecks = [],
  readinessNow,
  ...gatewayOptions
} = {}) {
  const gateway = createOperationalGateway(gatewayOptions);
  const readiness = createOperationalReadinessService({
    store: gateway.store,
    checks: readinessChecks,
    ...(readinessNow ? { now: readinessNow } : {}),
  });
  const app = createReadinessHttpApp({
    app: gateway.app,
    readiness,
  });

  return Object.freeze({
    ...gateway,
    readiness,
    app,
  });
}
