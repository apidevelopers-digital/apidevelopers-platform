const ENABLED_FLAG = "FAMILY_DATA_GATEWAY_BINDING_ENABLED";
const POSTGRES_CONFIRMED_FLAG = "FAMILY_DATA_POSTGRES_RUNTIME_CONFIRMED";
const POSTGRES_CONFIRMATION_LITERAL = "FAMILY_DATA_PRIVATE_POSTGRES_CONFIRMED";
const DEFAULT_TENANT_ID = "homosapiens-id";
const DEFAULT_SCHEMA = "family_data";
const DEFAULT_MODE = "inactive_plan";

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function boolFlag(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function hasFunction(value, name) {
  return Boolean(value) && typeof value[name] === "function";
}

function redactPresence(value) {
  return Boolean(normalizeText(value));
}

function collectChecks({ env, pool, authorize }) {
  const enabled = boolFlag(env[ENABLED_FLAG]);
  const postgresConfirmed = env[POSTGRES_CONFIRMED_FLAG] === POSTGRES_CONFIRMATION_LITERAL;

  return Object.freeze({
    binding_enabled: enabled,
    postgres_runtime_confirmed: postgresConfirmed,
    tenant_supported: normalizeText(env.FAMILY_DATA_TENANT_ID ?? DEFAULT_TENANT_ID) === DEFAULT_TENANT_ID,
    household_configured: redactPresence(env.FAMILY_DATA_HOUSEHOLD_ID),
    schema_configured: redactPresence(env.FAMILY_DATA_POSTGRES_SCHEMA ?? DEFAULT_SCHEMA),
    pool_present: Boolean(pool),
    pool_query_present: hasFunction(pool, "query"),
    pool_connect_present: hasFunction(pool, "connect"),
    authorize_callback_present: typeof authorize === "function"
  });
}

export function planFamilyDataGatewayBinding({
  env = {},
  pool,
  authorize,
  serviceName = "api-gateway",
  tenantId = env.FAMILY_DATA_TENANT_ID ?? DEFAULT_TENANT_ID,
  householdId = env.FAMILY_DATA_HOUSEHOLD_ID,
  schema = env.FAMILY_DATA_POSTGRES_SCHEMA ?? DEFAULT_SCHEMA
} = {}) {
  const checks = collectChecks({ env, pool, authorize });
  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  return Object.freeze({
    mode: DEFAULT_MODE,
    service_name: serviceName,
    source: "gateway_family_data_binding_plan_v1",
    tenant_id: normalizeText(tenantId),
    household_id_configured: redactPresence(householdId),
    schema: normalizeText(schema),
    ready: missing.length === 0,
    missing_checks: Object.freeze(missing),
    checks,
    performs_query: false,
    acquires_client: false,
    opens_network_connection: false,
    reads_credentials: false,
    deploy_executed: false,
    migration_executed: false,
    ingestion_executed: false
  });
}

export function assertFamilyDataGatewayBindingReady(options = {}) {
  const plan = planFamilyDataGatewayBinding(options);
  if (!plan.ready) {
    const error = new TypeError(`family_data_gateway_binding_not_ready:${plan.missing_checks.join(",")}`);
    error.code = "family_data_gateway_binding_not_ready";
    error.plan = plan;
    throw error;
  }
  return plan;
}

export const FAMILY_DATA_GATEWAY_BINDING_ENV = Object.freeze({
  ENABLED_FLAG,
  POSTGRES_CONFIRMED_FLAG,
  POSTGRES_CONFIRMATION_LITERAL,
  DEFAULT_TENANT_ID,
  DEFAULT_SCHEMA
});
