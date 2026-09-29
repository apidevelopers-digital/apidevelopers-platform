import { createMitraJurisprudenceProviderRunner } from "./mitra-jurisprudence-provider-readonly.mjs";

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
  buscarJurisprudencia: "/v1/ada/mitra/legal/jurisprudencia",
});

const LEGAL_READ_ONLY_ADAPTERS = Object.freeze([
  Object.freeze({
    id: "mitra.buscar_jurisprudencia",
    domain: "legal",
    access: "read_only",
    executionStatus: "stub_unavailable",
    route: ROUTES.buscarJurisprudencia,
    externalConnectionEnabled: false,
    credentialsRequired: false,
    writeAllowed: false,
    rawSqlAllowed: false,
    description: "Read-only jurisprudence search adapter stub. It validates the safe execution envelope and returns dependency_unavailable until an approved external source is connected.",
  }),
  Object.freeze({
    id: "mitra.pesquisar_fontes_oficiais",
    domain: "legal",
    access: "read_only",
    executionStatus: "contract_only",
    route: null,
    externalConnectionEnabled: false,
    credentialsRequired: false,
    writeAllowed: false,
    rawSqlAllowed: false,
    description: "Register the read-only official sources research adapter contract without external execution.",
  }),
  Object.freeze({
    id: "mitra.buscar_processo",
    domain: "legal",
    access: "read_only",
    executionStatus: "contract_only",
    route: null,
    externalConnectionEnabled: false,
    credentialsRequired: false,
    writeAllowed: false,
    rawSqlAllowed: false,
    description: "Register the read-only process lookup adapter contract without external execution.",
  }),
]);

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

function legalCapabilityPayload(adapter) {
  return Object.freeze({
    id: adapter.id,
    method: "GET",
    path: adapter.route,
    access: adapter.access,
    domain: adapter.domain,
    executionStatus: adapter.executionStatus,
    externalConnectionEnabled: adapter.externalConnectionEnabled,
    credentialsRequired: adapter.credentialsRequired,
    writeAllowed: adapter.writeAllowed,
    rawSqlAllowed: adapter.rawSqlAllowed,
    description: adapter.description,
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
      ...LEGAL_READ_ONLY_ADAPTERS.map(legalCapabilityPayload),
    ]),
    legalAdapters: LEGAL_READ_ONLY_ADAPTERS,
    unavailableUntilApproved: Object.freeze([
      "live_database_query",
      "dry_run_actions",
      "approved_execution",
      "raw_sql",
      "credential_management",
      "external_lex_mitra_execution",
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
    connectors: LEGAL_READ_ONLY_ADAPTERS,
    connectorCount: LEGAL_READ_ONLY_ADAPTERS.length,
    liveDatabaseConnected: false,
    credentialsConfigured: false,
    externalConnectionEnabled: false,
    rawSqlAllowed: false,
    writeAllowed: false,
    nextStep: "prepare_first_read_only_legal_adapter_execution_stub_via_separate_approved_pr",
    identity: safeIdentity(identity),
  });
}

function jurisprudenciaStubPayload({ identity, now }) {
  return Object.freeze({
    ok: false,
    service: "ada-mitra-bridge",
    productId: PRODUCT_ID,
    generatedAt: now(),
    adapterId: "mitra.buscar_jurisprudencia",
    status: "unavailable",
    error: "dependency_unavailable",
    reason: "jurisprudence_source_not_connected",
    executionStatus: "stub_unavailable",
    access: "read_only",
    readOnly: true,
    writeExecuted: false,
    externalConnectionEnabled: false,
    liveDatabaseConnected: false,
    credentialsRequired: false,
    rawSqlAllowed: false,
    writeAllowed: false,
    secretsExposed: false,
    nextStep: "connect_approved_read_only_jurisprudence_source_via_separate_pr",
    identity: safeIdentity(identity),
  });
}

function jurisprudenceProviderInputFromUrl(url) {
  const parsed = new URL(String(url), "http://api-gateway.local");
  const searchParams = parsed.searchParams;
  return Object.freeze({
    q: searchParams.get("q") ?? searchParams.get("query") ?? "",
    ...(searchParams.has("tribunal") ? { tribunal: searchParams.get("tribunal") } : {}),
    ...(searchParams.has("periodFrom") ? { periodFrom: searchParams.get("periodFrom") } : {}),
    ...(searchParams.has("periodTo") ? { periodTo: searchParams.get("periodTo") } : {}),
    ...(searchParams.has("limit") ? { limit: searchParams.get("limit") } : {}),
  });
}

function jurisprudenceProviderPayload({ result, identity, now }) {
  return Object.freeze({
    ok: result.ok === true,
    service: "ada-mitra-bridge",
    productId: PRODUCT_ID,
    generatedAt: now(),
    adapterId: "mitra.buscar_jurisprudencia",
    status: result.ok === true ? "ready" : "unavailable",
    ...(result.error ? { error: result.error } : {}),
    ...(result.reason ? { reason: result.reason } : {}),
    executionStatus: result.executionStatus ?? (result.ok === true ? "read_only_provider_result" : "provider_contract_ready"),
    access: "read_only",
    readOnly: true,
    writeExecuted: false,
    externalConnectionEnabled: false,
    liveDatabaseConnected: false,
    credentialsRequired: false,
    rawSqlAllowed: false,
    writeAllowed: false,
    secretsExposed: false,
    ...(result.query ? { query: result.query } : {}),
    ...(Array.isArray(result.results) ? { results: Object.freeze([...result.results]) } : {}),
    nextStep: result.ok === true
      ? "connect_approved_public_jurisprudence_source_via_separate_pr"
      : "connect_approved_read_only_jurisprudence_source_via_separate_pr",
    identity: safeIdentity(identity),
  });
}

export function createAdaMitraBridgeReadOnly({
  authenticator,
  requiredScope = REQUIRED_SCOPE,
  now = () => new Date().toISOString(),
  jurisprudenceProvider,
} = {}) {
  if (authenticator !== undefined && typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }

  const jurisprudenceProviderRunner = createMitraJurisprudenceProviderRunner( { provider: jurisprudenceProvider });

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
      if (pathname === ROUTES.buscarJurisprudencia) {
        if (!jurisprudenceProviderRunner.enabled) {
          return jsonResponse(503, jurisprudenciaStubPayload({ identity, now }));
        }

        const result = await jurisprudenceProviderRunner.search(jurisprudenceProviderInputFromUrl(url), identity);
        return jsonResponse(result.status ?? (result.ok ? 200 : 503), jurisprudenceProviderPayload({ result, identity, now }));
      }

      return null;
    },
  });
}

export const adaMitraBridgeReadOnlyContract = Object.freeze({
  productId: PRODUCT_ID,
  requiredScope: REQUIRED_SCOPE,
  routes: ROUTES,
  previewRuntimeSha: PREVIEW_RUNTIME_SHA,
  legalReadOnlyAdapters: LEGAL_READ_ONLY_ADAPTERS,
  liveDatabaseConnected: false,
  rawSqlAllowed: false,
  writeAllowed: false,
});
