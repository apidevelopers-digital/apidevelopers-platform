import { planFamilyDataPostgresProtectedPreflight } from "./family-data-postgres-protected-preflight.mjs";

const DEFAULT_PREFLIGHT_PATH = "/v1/family-data/postgres/preflight";

function requireGatewayApp(app) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest is required");
  }
  return app;
}

function requestMethod(request) {
  return String(request?.method ?? "GET").toUpperCase();
}

function requestUrl(request) {
  return new URL(String(request?.url ?? DEFAULT_PREFLIGHT_PATH), "http://localhost");
}

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  const payload = JSON.stringify(body);
  if (typeof Response === "function") {
    return new Response(payload, {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...headers
      }
    });
  }

  return Object.freeze({
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }),
    body: payload
  });
}

function modeFromRequest(url) {
  const requestedMode = url.searchParams.get("mode");
  return requestedMode === "live_probe" ? "live_probe" : "dry_run";
}

function confirmationFromRequest({ env, url }) {
  return env.FAMILY_DATA_POSTGRES_PREFLIGHT_CONFIRMATION ?? url.searchParams.get("confirmation") ?? undefined;
}

export function createFamilyDataPostgresProtectedPreflightHttpApp({
  app,
  env = process.env,
  pool,
  authorize,
  preflightPath = DEFAULT_PREFLIGHT_PATH,
  planner = planFamilyDataPostgresProtectedPreflight
} = {}) {
  const sourceApp = requireGatewayApp(app);

  async function handleRequest(request, context) {
    const method = requestMethod(request);
    const url = requestUrl(request);

    if (url.pathname === preflightPath && (method === "GET" || method === "HEAD")) {
      const mode = modeFromRequest(url);
      const plan = planner({
        env,
        pool,
        authorize,
        mode,
        confirmation: confirmationFromRequest({ env, url })
      });

      return jsonResponse({
        ok: true,
        route: preflightPath,
        method,
        mode,
        family_data_postgres_preflight: plan
      });
    }

    return sourceApp.handleRequest(request, context);
  }

  return Object.freeze({
    enabled: true,
    app: Object.freeze({
      ...sourceApp,
      handleRequest
    }),
    descriptor: Object.freeze({
      mode: "postgres-preflight-metadata-only",
      route: preflightPath,
      opens_network_connection: false,
      performs_query: false,
      reads_credentials: false,
      mutates_database: false,
      deploy_executed: false,
      migration_executed: false,
      ingestion_executed: false
    })
  });
}

export function attachFamilyDataPostgresProtectedPreflightToGateway({
  gateway,
  env = process.env,
  pool = gateway?.familyDataPostgresPool,
  authorize = gateway?.familyDataAuthorize,
  preflightPath = DEFAULT_PREFLIGHT_PATH,
  planner = planFamilyDataPostgresProtectedPreflight
} = {}) {
  if (!gateway || typeof gateway !== "object") {
    throw new TypeError("gateway is required");
  }

  const preflight = createFamilyDataPostgresProtectedPreflightHttpApp({
    app: gateway.app,
    env,
    pool,
    authorize,
    preflightPath,
    planner
  });

  return Object.freeze({
    ...gateway,
    app: preflight.app,
    familyDataPostgresPreflight: preflight.descriptor
  });
}

export const FAMILY_DATA_POSTGRES_PREFLIGHT_ROUTE = DEFAULT_PREFLIGHT_PATH;
