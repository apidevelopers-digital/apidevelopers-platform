import { preflightFamilyDataPostgresPool } from "./family-data-postgres-pool-contract.mjs";

const SCHEMA_CONFIRMATION = "FAMILY_DATA_SCHEMA_READINESS_PROBE";
const SAFE_SCHEMA = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REQUIRED_TABLES = Object.freeze([
  "evidence",
  "payments",
  "product_aliases",
  "products",
  "purchase_items",
  "purchases"
]);

function normalizeSchema(value = "family_data") {
  const schema = String(value ?? "").trim();
  if (!SAFE_SCHEMA.test(schema)) {
    throw new TypeError("Family Data schema identifier is invalid");
  }
  return schema;
}

export function planFamilyDataPostgresSchemaReadiness({
  pool,
  householdId,
  tenantId = "homosapiens-id",
  schema = "family_data"
} = {}) {
  const poolPreflight = preflightFamilyDataPostgresPool({
    pool,
    householdId,
    tenantId
  });
  const normalizedSchema = normalizeSchema(schema);

  return Object.freeze({
    ready: poolPreflight.ready,
    runtime_owner: "hostinger_managed_hosting_git_runtime",
    tenant_id: poolPreflight.tenant_id,
    household_id_configured: poolPreflight.household_id_configured,
    pool_source: poolPreflight.source,
    schema: normalizedSchema,
    required_tables: REQUIRED_TABLES,
    execution_requires_confirmation: true,
    confirmation_literal: SCHEMA_CONFIRMATION,
    schema_catalog_read_executed: false,
    data_rows_read: false,
    schema_mutated: false,
    deploy_executed: false,
    credentials_exposed: false,
    pool_checks: poolPreflight.checks
  });
}

export async function probeFamilyDataPostgresSchemaReadiness({
  pool,
  householdId,
  tenantId = "homosapiens-id",
  schema = "family_data",
  execute = false,
  confirmation
} = {}) {
  const plan = planFamilyDataPostgresSchemaReadiness({
    pool,
    householdId,
    tenantId,
    schema
  });

  if (!plan.ready) {
    const missing = Object.entries(plan.pool_checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name)
      .join(", ");
    throw new TypeError(`family_data_schema_preflight_failed:${missing}`);
  }

  if (!execute) {
    return Object.freeze({
      ...plan,
      status: "dry_run",
      schema_exists: null,
      present_tables: [],
      missing_tables: [...REQUIRED_TABLES]
    });
  }

  if (confirmation !== SCHEMA_CONFIRMATION) {
    throw new TypeError("explicit schema readiness probe confirmation is required");
  }

  let client;
  try {
    client = await pool.connect();
    if (!client || typeof client.query !== "function") {
      throw new TypeError("connected PostgreSQL client with query() is required");
    }

    const schemaResult = await client.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) AS schema_exists",
      [plan.schema]
    );
    const schemaExists = schemaResult?.rows?.[0]?.schema_exists === true;

    let presentTables = [];
    if (schemaExists) {
      const tableResult = await client.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = $1
           AND table_type = 'BASE TABLE'
           AND table_name = ANY($2::text[])
         ORDER BY table_name`,
        [plan.schema, [...REQUIRED_TABLES]]
      );
      presentTables = (tableResult?.rows ?? [])
        .map((row) => row?.table_name)
        .filter((name) => REQUIRED_TABLES.includes(name));
    }

    const present = new Set(presentTables);
    const missingTables = REQUIRED_TABLES.filter((name) => !present.has(name));

    return Object.freeze({
      ...plan,
      status: schemaExists && missingTables.length === 0 ? "ready" : "not_ready",
      schema_exists: schemaExists,
      present_tables: Object.freeze([...presentTables]),
      missing_tables: Object.freeze(missingTables),
      schema_catalog_read_executed: true
    });
  } finally {
    if (client && typeof client.release === "function") {
      client.release();
    }
  }
}

export const FAMILY_DATA_SCHEMA_READINESS_PROBE_CONFIRMATION = SCHEMA_CONFIRMATION;
export const FAMILY_DATA_REQUIRED_POSTGRES_TABLES = REQUIRED_TABLES;
