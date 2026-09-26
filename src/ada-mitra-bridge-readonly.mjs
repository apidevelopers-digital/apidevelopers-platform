const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
});

const PRODUCT_ID = "product:mitra";
const PREVIEW_RUNTIME_SHA = "64fe412b75962f6a0f07c1423cd0b6f11dd64540";
const REQUIRED_SCOPE = "ada:mitra:read";
const MITRA_MCP_VERSION = "1.0.0-draft";

const ROUTES = Object.freeze({
  status: "/v1/ada/mitra/status",
  capabilities: "/v1/ada/mitra/capabilities",
  connectors: "/v1/ada/mitra/connectors",
});

const MITRA_MCP_ROUTES = Object.freeze({
  status: "/v1/mitra/mcp/status",
  capabilities: "/v1/mitra/mcp/capabilities",
});

const MITRA_MCP_SCOPES = Object.freeze({
  status: "mitra:status:read",
  capabilities: "mitra:capabilities:read",
});

const MITRA_MCP_COMPATIBILITY_SCOPE = REQUIRED_SCOPE;

function jsonResponse(status, payload) {
  return Object.freeze({ status, headers: JSON_HEADERS, body: JSON.stringify(payload) });
}

function principalScopes(identity) {
  const scopes = identity?.principal?.scopes;
  return Array.isArray(scopes) ? scopes.map(String) : [];
}

function hasAnyScope(identity, scopes) {
  const assigned = principalScopes(identity);
  return assigned.includes("admin:*") || scopes.some((scope) => assigned.includes(scope));
}

function hasScope(identity, scope) {
  return hasAnyScope(identity, [scope]);
}

function headerValue(headers = {}, name) {
  const expected = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (String(key).toLowerCase() === expected) return value;
  }
  return undefined;
}

function tenantIdFrom({ headers = {}, identity } = {}) {
  return (
    String(headerValue(headers, "x-tenant-id") ?? "").trim() ||
    String(identity?.principal?.tenantId ?? "").trim() ||
    String(identity?.tenantId ?? "").trim() ||
    "unknown"
  );
}

function safeIdentity(identity) {
  const principal = identity?.principal ?? {};
  return Object.freeze({
    role: identity?.role ?? "unknown",
    principal: Object.freeze({
      ...(principal.id ? { id: principal.id } : {}),
      ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
      scopes: principalScopes(identity),
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

function mitraMcpStatusPayload({ identity, headers, now }) {
  return Object.freeze({
    ok: true,
    service: "mitra-mcp",
    version: MITRA_MCP_VERSION,
    status: "ready",
    tenantId: tenantIdFrom({ headers, identity }),
    generatedAt: now(),
    routes: MITRA_MCP_ROUTES,
    safety: Object.freeze({
      readOnlyFirst: true,
      secretsReturned: false,
      externalCallsExecuted: false,
      lexAdapterConnected: false,
      mitraOrchestratorAdapterConnected: false,
      unsupportedToolsFailClosed: true,
    }),
  });
}

function mitraMcpCapabilitiesPayload({ identity, headers, now }) {
  return Object.freeze({
    ok: true,
    service: "mitra-mcp",
    version: MITRA_MCP_VERSION,
    tenantId: tenantIdFrom({ headers, identity }),
    generatedAt: now(),
    tools: Object.freeze(["mitra.status", "mitra.capabilities"]),
    toolDefinitions: Object.freeze([
      Object.freeze({
        name: "mitra.status",
        title: "Mitra status",
        path: MITRA_MCP_ROUTES.status,
        method: "GET",
        requiredScope: MITRA_MCP_SCOPES.status,
        backend: "ada-gateway",
        risk: "R1_READONLY",
        mutatesState: false,
        destructive: false,
        secretsReturned: false,
      }),
      Object.freeze({
        name: "mitra.capabilities",
        title: "Mitra capabilities",
        path: MITRA_MCP_ROUTES.capabilities,
        method: "GET",
        requiredScope: MITRA_MCP_SCOPES.capabilities,
        backend: "ada-gateway",
        risk: "R1_READONLY",
        mutatesState: false,
        destructive: false,
        secretsReturned: false,
      }),
    ]),
    pendingAdapters: Object.freeze([
      "mitra.buscar_jurisprudencia",
      "mitra.pesquisar_fontes_oficiais",
      "mitra.buscar_processo",
      "mitra.contexto_cliente",
      "mitra.analisar_caso",
      "mitra.analisar_documento",
      "mitra.gerar_tese",
      "mitra.gerar_minuta",
      "mitra.veritas",
    ]),
    limits: Object.freeze({}),
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

  async function authenticate(headers) {
    if (!authenticator) {
      return { response: jsonResponse(503, { ok: false, error: "authentication_unavailable", writeExecuted: false }) };
    }

    const identity = await authenticator.authenticate(headers);
    if (!identity) {
      return { response: jsonResponse(401, { ok: false, error: "unauthorized", writeExecuted: false }) };
    }

    return { identity };
  }

  function methodNotAllowed() {
    return jsonResponse(405, { ok: false, error: "method_not_allowed", writeExecuted: false });
  }

  function insufficientScope(scopes) {
    return jsonResponse(403, {
      ok: false,
      error: "insufficient_scope",
      requiredScope: Array.isArray(scopes) ? scopes.join(" OR ") : scopes,
      writeExecuted: false,
    });
  }

  return Object.freeze({
    routes: Object.freeze({ ...ROUTES, mitraMcp: MITRA_MCP_ROUTES }),
    requiredScope,

    async handleRequest({ method = "GET", url = "/", headers = {} } = {}) {
      const normalizedMethod = String(method).toUpperCase();
      const pathname = new URL(String(url), "http://api-gateway.local").pathname;

      if (![...Object.values(ROUTES), ...Object.values(MITRA_MCP_ROUTES)].includes(pathname)) return null;

      if (normalizedMethod !== "GET") return methodNotAllowed();

      const auth = await authenticate(headers);
      if (auth.response) return auth.response;
      const { identity } = auth;

      if (pathname === ROUTES.status || pathname === ROUTES.capabilities || pathname === ROUTES.connectors) {
        if (!hasScope(identity, requiredScope)) return insufficientScope(requiredScope);

        if (pathname === ROUTES.status) return jsonResponse(200, statusPayload({ identity, now }));
        if (pathname === ROUTES.capabilities) return jsonResponse(200, capabilitiesPayload({ identity, now }));
        if (pathname === ROUTES.connectors) return jsonResponse(200, connectorsPayload({ identity, now }));
      }

      if (pathname === MITRA_MCP_ROUTES.status) {
        if (!hasAnyScope(identity, [MITRA_MCP_SCOPES.status, MITRA_MCP_COMPATIBILITY_SCOPE])) {
          return insufficientScope([MITRA_MCP_SCOPES.status, MITRA_MCP_COMPATIBILITY_SCOPE]);
        }

        return jsonResponse(200, mitraMcpStatusPayload({ identity, headers, now }));
      }

      if (pathname === MITRA_MCP_ROUTES.capabilities) {
        if (!hasAnyScope(identity, [MITRA_MCP_SCOPES.capabilities, MITRA_MCP_COMPATIBILITY_SCOPE])) {
          return insufficientScope([MITRA_MCP_SCOPES.capabilities, MITRA_MCP_COMPATIBILITY_SCOPE]);
        }

        return jsonResponse(200, mitraMcpCapabilitiesPayload({ identity, headers, now }));
      }

      return null;
    },
  });
}

export const adaMitraBridgeReadOnlyContract = Object.freeze({
  productId: PRODUCT_ID,
  requiredScope: REQUIRED_SCOPE,
  routes: ROUTES,
  mitraMcpRoutes: MITRA_MCP_ROUTES,
  mitraMcpScopes: MITRA_MCP_SCOPES,
  mitraMcpVersion: MITRA_MCP_VERSION,
  previewRuntimeSha: PREVIEW_RUNTIME_SHA,
  liveDatabaseConnected: false,
  rawSqlAllowed: false,
  writeAllowed: false,
});
