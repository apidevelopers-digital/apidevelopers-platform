import { planFamilyDataGatewayBinding } from "./family-data-gateway-binding-plan.mjs";

const DEFAULT_READINESS_PATH = "/v1/family-data/readiness";

function requireGatewayApp(app) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest is required");
  }
  return app;
}

function requestMethod(request) {
  return String(request?.method ?? "GET").toUpperCase();
}

function requestPathname(request) {
  const url = new URL(String(request?.url ?? DEFAULT_READINESS_PATH), "http://localhost");
  return url.pathname;
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

export function createFamilyDataGatewayReadinessHttpApp({
  app,
  env = process.env,
  pool,
  authorize,
  readinessPath = DEFAULT_READINESS_PATH,
  planner = planFamilyDataGatewayBinding
} = {}) {
  const sourceApp = requireGatewayApp(app);

  async function handleRequest(request, context) {
    const method = requestMethod(request);
    const pathname = requestPathname(request);

    if (pathname === readinessPath && (method === "GET" || method === "HEAD")) {
      const plan = planner({
        env,
        pool,
        authorize,
        serviceName: "api-gateway"
      });

      return jsonResponse({
        ok: true,
        route: readinessPath,
        method,
        family_data_gateway_binding: plan
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
      mode: "readiness-metadata-only",
      route: readinessPath,
      opens_network_connection: false,
      performs_query: false,
      reads_credentials: false,
      deploy_executed: false,
      migration_executed: false,
      ingestion_executed: false
    })
  });
}

export function attachFamilyDataGatewayReadinessToGateway({
  gateway,
  env = process.env,
  pool = gateway?.familyDataPostgresPool,
  authorize = gateway?.familyDataAuthorize,
  readinessPath = DEFAULT_READINESS_PATH,
  planner = planFamilyDataGatewayBinding
} = {}) {
  if (!gateway || typeof gateway !== "object") {
    throw new TypeError("gateway is required");
  }

  const readiness = createFamilyDataGatewayReadinessHttpApp({
    app: gateway.app,
    env,
    pool,
    authorize,
    readinessPath,
    planner
  });

  return Object.freeze({
    ...gateway,
    app: readiness.app,
    familyDataGatewayReadiness: readiness.descriptor
  });
}

export const FAMILY_DATA_GATEWAY_READINESS_ROUTE = DEFAULT_READINESS_PATH;
