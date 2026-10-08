import { preflightFamilyDataPostgresPool } from "./family-data-postgres-pool-contract.mjs";

const PROBE_CONFIRMATION = "FAMILY_DATA_CONNECTIVITY_PROBE";
const PROBE_SQL = "SELECT 1 AS family_data_connectivity_probe";

export function planFamilyDataPostgresConnectivity({
  pool,
  householdId,
  tenantId = "homosapiens-id"
} = {}) {
  const poolPreflight = preflightFamilyDataPostgresPool({
    pool,
    householdId,
    tenantId
  });

  return Object.freeze({
    ready: poolPreflight.ready,
    runtime_owner: "hostinger_managed_hosting_git_runtime",
    tenant_id: poolPreflight.tenant_id,
    household_id_configured: poolPreflight.household_id_configured,
    pool_source: poolPreflight.source,
    probe_sql: PROBE_SQL,
    execution_requires_confirmation: true,
    confirmation_literal: PROBE_CONFIRMATION,
    connectivity_executed: false,
    query_executed: false,
    deploy_executed: false,
    credentials_exposed: false,
    pool_checks: poolPreflight.checks
  });
}

export async function probeFamilyDataPostgresConnectivity({
  pool,
  householdId,
  tenantId = "homosapiens-id",
  execute = false,
  confirmation
} = {}) {
  const plan = planFamilyDataPostgresConnectivity({
    pool,
    householdId,
    tenantId
  });

  if (!plan.ready) {
    const missing = Object.entries(plan.pool_checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name)
      .join(", ");
    throw new TypeError(`family_data_connectivity_preflight_failed:${missing}`);
  }

  if (!execute) {
    return Object.freeze({
      ...plan,
      status: "dry_run"
    });
  }

  if (confirmation !== PROBE_CONFIRMATION) {
    throw new TypeError("explicit connectivity probe confirmation is required");
  }

  let client;
  try {
    client = await pool.connect();
    if (!client || typeof client.query !== "function") {
      throw new TypeError("connected PostgreSQL client with query() is required");
    }

    const result = await client.query(PROBE_SQL);
    const value = result?.rows?.[0]?.family_data_connectivity_probe;
    if (Number(value) !== 1) {
      throw new Error("family_data_connectivity_probe_unexpected_result");
    }

    return Object.freeze({
      ...plan,
      status: "success",
      connectivity_executed: true,
      query_executed: true
    });
  } finally {
    if (client && typeof client.release === "function") {
      client.release();
    }
  }
}

export const FAMILY_DATA_CONNECTIVITY_PROBE_CONFIRMATION = PROBE_CONFIRMATION;
