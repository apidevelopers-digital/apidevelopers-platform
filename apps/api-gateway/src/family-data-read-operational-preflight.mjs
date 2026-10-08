function hasFunction(value, name) {
  return Boolean(value) && typeof value[name] === "function";
}

export function preflightFamilyDataOperationalDependencies({
  gateway,
  db,
  householdId,
  tenantId = "homosapiens-id"
} = {}) {
  const authenticator = gateway?.authenticator;
  const normalizedHouseholdId = String(householdId ?? "").trim();
  const normalizedTenantId = String(tenantId ?? "").trim();

  const checks = Object.freeze({
    operational_gateway_present: Boolean(gateway),
    authenticator_present: hasFunction(authenticator, "authenticate"),
    db_query_present: hasFunction(db, "query"),
    household_configured: Boolean(normalizedHouseholdId),
    tenant_supported: normalizedTenantId === "homosapiens-id"
  });

  const ready = Object.values(checks).every(Boolean);

  return Object.freeze({
    ready,
    tenant_id: normalizedTenantId || undefined,
    household_id_configured: Boolean(normalizedHouseholdId),
    authenticator_source: checks.authenticator_present
      ? "operational_gateway.authenticator"
      : "missing",
    db_source: checks.db_query_present ? "external_injected_query_adapter" : "missing",
    performs_db_query: false,
    opens_network_connection: false,
    reads_secrets: false,
    deploy_executed: false,
    checks
  });
}

export function composeFamilyDataOperationalDependencies({
  gateway,
  db,
  householdId,
  tenantId = "homosapiens-id"
} = {}) {
  const preflight = preflightFamilyDataOperationalDependencies({
    gateway,
    db,
    householdId,
    tenantId
  });

  if (!preflight.ready) {
    const missing = Object.entries(preflight.checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name)
      .join(", ");
    throw new TypeError(`family_data_operational_preflight_failed:${missing}`);
  }

  return Object.freeze({
    tenantId,
    householdId: String(householdId).trim(),
    authenticator: gateway.authenticator,
    db
  });
}
