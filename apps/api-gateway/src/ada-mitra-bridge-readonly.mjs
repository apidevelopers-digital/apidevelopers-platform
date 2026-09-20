const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
});

const PRODUCT_ID = "product:mitra";
const PREVIEW_RUNTIME_SHA = "64fe412b75962f6a0f07c1423cd0b6f11dd64540";
const REQUIRED_SCOPE = "ada:mitra:read";
const ROUTES = Object.freeze({
  status: "/v1/ada/mitra/status",
  capabilities: "/v1/ada/mitra/capabilities",
  connectors: "/v1/ada/mitra/connectors",
});

function jsonResponse(status, payload) {
  return Object.freeze({ status, headers: JSON_HEADERS, body: JSON.stringify(payload) });
}

function hasScope(identity, scope) {
  const scopes = identity?.principal?.scopes;
  return Array.isArray(scopes) && scopes.includes(scope);
}

function safeIdentity(identity) {
  const principal = identity?.principal ?? {};
  return Object.freeze({
    role: identity?.role ?? "unknown",
    principal: Object.freeze({
      ...(principal.id ? { id: principal.id } : {}),
      ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
      scopes: Array.isArray(principal.scopes) ? [...principal.scopes] : [],
    }),
  });
}

function statusPayload({ identity, now }) {
  return Object.freeze({
    ok: true,
    service: "ada-mitra-bridge",
    status: "ready",
    mode: "read_only_skeleton",
    productId: PRODUCT_ID,
    generatedAt: now(),
    preview: Object.freeze({ loginConfirmed: true, gatewayRuntimeSourceSha: PREVIEW_RUNTIME_SHA }),
    dataAccess: Object.freeze({
      liveDatabaseConnected: false,
      databaseCredentialsConfigured: false,
      rawSqlAllowed: false,
      writeAllowed: false,
    }),
    safety: Object.freeze({
      readOnly: true,
      dryRunEnabled: false,
      executeEnabled: false,
      secretsExposed: false,
      approvalRequiredForWrites: true,
    }),
    identity: safeIdentity(identity),
  });
}

function capabilitiesPayload({ identity, now }) {
  return Object.freeze({
    ok: true,
    service: "ada-mitra-bridge",
    productId: PRODUCT_ID,
    generatedAt: now(),
    level: "read_only_skeleton",
    capabilities: Object.freeze([
      Object.freeze({
        id: "mitra.status",
        method: "GET",
        path: ROUTES.status,
        access: "read_only",
        description: "Read ADA to Mitra bridge operational status.",
      }),
      Object.freeze({
        id: "mitra.capabilities",
        method: "GET",
        path: ROUTES.capabilities,
        access: "read_only",
        description: "List enabled bridge capabilities.",
      }),
      Object.freeze({
        id: "mitra.connectors",
        method: "GET",
        path: ROUTES.connectors,
        access: "read_only",
        description: "List registered safe connectors without credentials.",
      }),
    ]),
    unavailableUntilApproved: Object.freeze([
      "live_database_query",
      "dry_run_actions",
      "approved_execution",
      "raw_sql",
      "credential_management",
    ]),
    identity: safeIdentity(identity),
  });
}

function connectorsPayload({ identity, now }) {
  return Object.freeze({
    ok: true,
    service: "ada-mitra-bridge",
    productId: PRODUCT_ID,
    generatedAt: now(),
    connectors: Object.freeze([]),
    connectorCount: 0,
    liveDatabaseConnected: false,
    credentialsConfigured: false,
    rawSqlAllowed: false,
    writeAllowed: false,
    nextStep: "register_first_read_only_connector_via_separate_approved_pr",
    identity: safeIdentity(identity),
  });
}

export function createAdaMitraBridgeReadOnly({
  authenticator,
  requiredScope = REQUIRED_SCOPE,
  now = () => new Date().toISOString(),
} = {}) {
  if (authenticator !== undefined && typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }

  return Object.freeze({
    routes: ROUTES,
    requiredScope,

    async handleRequest({ method = "GET", url = "/", headers = {} } = {}) {
      const normalizedMethod = String(method).toUpperCase();
      const pathname = new URL(String(url), "http://api-gateway.local").pathname;
      if (!Object.values(ROUTES).includes(pathname)) return null;

      if (normalizedMethod !== "GET") {
        return jsonResponse(405, { ok: false, error: "method_not_allowed", writeExecuted: false });
      }

      if (!authenticator) {
        return jsonResponse(503, { ok: false, error: "authentication_unavailable", writeExecuted: false });
      }

      const identity = await authenticator.authenticate(headers);
      if (!identity) {
        return jsonResponse(401, { ok: false, error: "unauthorized", writeExecuted: false });
      }

      if (!hasScope(identity, requiredScope)) {
        return jsonResponse(403, { ok: false, error: "insufficient_scope", requiredScope, writeExecuted: false });
      }

      if (pathname === ROUTES.status) return jsonResponse(200, statusPayload({ identity, now }));
      if (pathname === ROUTES.capabilities) return jsonResponse(200, capabilitiesPayload({ identity, now }));
      if (pathname === ROUTES.connectors) return jsonResponse(200, connectorsPayload({ identity, now }));

      return null;
    },
  });
}

export const adaMitraBridgeReadOnlyContract = Object.freeze({
  productId: PRODUCT_ID,
  requiredScope: REQUIRED_SCOPE,
  routes: ROUTES,
  previewRuntimeSha: PREVIEW_RUNTIME_SHA,
  liveDatabaseConnected: false,
  rawSqlAllowed: false,
  writeAllowed: false,
});
