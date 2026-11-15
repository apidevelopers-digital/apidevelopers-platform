function hasFunction(value, name) {
  return Boolean(value) && typeof value[name] === "function";
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

export function preflightFamilyDataPostgresPool({
  pool,
  householdId,
  tenantId = "homosapiens-id"
} = {}) {
  const normalizedHouseholdId = normalizeText(householdId);
  const normalizedTenantId = normalizeText(tenantId);

  const checks = Object.freeze({
    pool_present: Boolean(pool),
    pool_query_present: hasFunction(pool, "query"),
    pool_connect_present: hasFunction(pool, "connect"),
    household_configured: Boolean(normalizedHouseholdId),
    tenant_supported: normalizedTenantId === "homosapiens-id"
  });

  return Object.freeze({
    ready: Object.values(checks).every(Boolean),
    source: "external_runtime_postgres_pool",
    tenant_id: normalizedTenantId,
    household_id_configured: Boolean(normalizedHouseholdId),
    performs_query: false,
    acquires_client: false,
    opens_network_connection: false,
    reads_credentials: false,
    deploy_executed: false,
    checks
  });
}

export function createFamilyDataPostgresQueryAdapter({
  pool,
  householdId,
  tenantId = "homosapiens-id"
} = {}) {
  const preflight = preflightFamilyDataPostgresPool({
    pool,
    householdId,
    tenantId
  });

  if (!preflight.ready) {
    const missing = Object.entries(preflight.checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name)
      .join(", ");

    throw new TypeError(`family_data_postgres_pool_preflight_failed:${missing}`);
  }

  return Object.freeze({
    kind: "family_data_postgres_query_adapter",
    source: preflight.source,
    tenantId: String(tenantId).trim(),
    householdId: String(householdId).trim(),
    async query(text, params) {
      return pool.query(text, params);
    }
  });
}
