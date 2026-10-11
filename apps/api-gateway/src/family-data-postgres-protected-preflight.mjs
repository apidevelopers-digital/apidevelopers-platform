const CONFIRMATION_LITERAL = "FAMILY_DATA_PRIVATE_POSTGRES_PREFLIGHT_APPROVED";
const DEFAULT_MODE = "dry_run";
const DEFAULT_SCHEMA = "family_data";
const DEFAULT_TENANT_ID = "homosapiens-id";

function normalized(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function isTrue(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function hasFunction(value, name) {
  return Boolean(value) && typeof value[name] === "function";
}

function redactConfigured(value) {
  return Boolean(normalized(value));
}

function validateMode(mode) {
  const normalizedMode = normalized(mode) ?? DEFAULT_MODE;
  if (!["dry_run", "live_probe"].includes(normalizedMode)) {
    throw new TypeError(`unsupported_family_data_postgres_preflight_mode:${normalizedMode}`);
  }
  return normalizedMode;
}

function buildChecks({ env, pool, authorize, confirmation }) {
  return Object.freeze({
    preflight_enabled:
      isTrue(env.FAMILY_DATA_POSTGRES_PREFLIGHT_ENABLED) ||
      isTrue(env.FAMILY_DATA_GATEWAY_BINDING_ENABLED),
    postgres_runtime_confirmed:
      env.FAMILY_DATA_POSTGRES_RUNTIME_CONFIRMED === "FAMILY_DATA_PRIVATE_POSTGRES_CONFIRMED",
    live_confirmation_present: confirmation === CONFIRMATION_LITERAL,
    tenant_supported: normalized(env.FAMILY_DATA_TENANT_ID ?? DEFAULT_TENANT_ID) === DEFAULT_TENANT_ID,
    household_configured: redactConfigured(env.FAMILY_DATA_HOUSEHOLD_ID),
    schema_configured: redactConfigured(env.FAMILY_DATA_POSTGRES_SCHEMA ?? DEFAULT_SCHEMA),
    pool_present: Boolean(pool),
    pool_query_present: hasFunction(pool, "query"),
    pool_connect_present: hasFunction(pool, "connect"),
    authorize_callback_present: typeof authorize === "function"
  });
}

function missingChecks(checks, { mode }) {
  const required = Object.entries(checks)
    .filter(([name]) => mode === "live_probe" || name !== "live_confirmation_present")
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  return Object.freeze(required);
}

export function planFamilyDataPostgresProtectedPreflight({
  env = {},
  pool,
  authorize,
  mode = DEFAULT_MODE,
  confirmation,
  tenantId = env.FAMILY_DATA_TENANT_ID ?? DEFAULT_TENANT_ID,
  householdId = env.FAMILY_DATA_HOUSEHOLD_ID,
  schema = env.FAMILY_DATA_POSTGRES_SCHEMA ?? DEFAULT_SCHEMA
} = {}) {
  const preflightMode = validateMode(mode);
  const checks = buildChecks({ env, pool, authorize, confirmation });
  const missing = missingChecks(checks, { mode: preflightMode });
  const liveProbeRequested = preflightMode === "live_probe";

  return Object.freeze({
    source: "family_data_postgres_protected_preflight_v1",
    mode: preflightMode,
    tenant_id: normalized(tenantId),
    household_id_configured: redactConfigured(householdId),
    schema: normalized(schema),
    ready: missing.length === 0,
    missing_checks: missing,
    checks,
    requires_explicit_confirmation: liveProbeRequested,
    confirmation_literal: liveProbeRequested ? CONFIRMATION_LITERAL : undefined,
    performs_query: false,
    acquires_client: false,
    opens_network_connection: false,
    reads_credentials: false,
    mutates_database: false,
    deploy_executed: false,
    migration_executed: false,
    ingestion_executed: false
  });
}

export async function runFamilyDataPostgresProtectedPreflight(options = {}) {
  const plan = planFamilyDataPostgresProtectedPreflight(options);

  if (plan.mode !== "live_probe") {
    return Object.freeze({
      ok: true,
      status: "dry_run_only",
      plan,
      result: undefined
    });
  }

  if (!plan.ready) {
    const error = new TypeError(
      `family_data_postgres_preflight_not_ready:${plan.missing_checks.join(",")}`
    );
    error.code = "family_data_postgres_preflight_not_ready";
    error.plan = plan;
    throw error;
  }

  const error = new TypeError("family_data_postgres_live_probe_blocked_by_operator_policy");
  error.code = "family_data_postgres_live_probe_blocked_by_operator_policy";
  error.plan = plan;
  throw error;
}

export const FAMILY_DATA_POSTGRES_PROTECTED_PREFLIGHT = Object.freeze({
  CONFIRMATION_LITERAL,
  DEFAULT_MODE,
  DEFAULT_SCHEMA,
  DEFAULT_TENANT_ID
});
