import { createPostgresFamilyDataHttpReadBoundary } from "@apidevelopers/family-data-core";
import { createFamilyDataReadGatewayBinding } from "./family-data-read-gateway-binding.mjs";
import { startServerWithFamilyDataReadGate } from "./family-data-read-runtime-gate.mjs";

const FAMILY_TENANT = "homosapiens-id";
const TRUE_VALUES = new Set(["1", "true"]);

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function parseEnabled(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  if (TRUE_VALUES.has(text)) return true;
  if (text === "0" || text === "false") return false;
  throw new TypeError("FAMILY_DATA_READ_ENABLED must be true/false or 1/0");
}

function requireDb(db) {
  if (!db || typeof db.query !== "function") {
    throw new TypeError("db.query is required when Family Data read runtime is enabled");
  }
  return db;
}

function requireAuthenticator(authenticator) {
  if (!authenticator || typeof authenticator.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate is required when Family Data read runtime is enabled");
  }
  return authenticator;
}

export function planFamilyDataReadActivation({ env = process.env } = {}) {
  const enabled = parseEnabled(env.FAMILY_DATA_READ_ENABLED);
  const householdId = normalizeText(env.FAMILY_DATA_HOUSEHOLD_ID);
  const schema = normalizeText(env.FAMILY_DATA_SCHEMA) ?? "family_data";

  return Object.freeze({
    enabled,
    tenant_id: FAMILY_TENANT,
    household_configured: Boolean(householdId),
    schema,
    requires_db: enabled,
    requires_authenticator: enabled,
    requires_household: enabled,
    deploy_executed: false,
    database_connected: false,
    api_storage_accessed: false,
    ingestion_executed: false
  });
}

export function createFamilyDataReadActivation({
  env = process.env,
  db,
  authenticator,
  generatedAt,
  requestId
} = {}) {
  const plan = planFamilyDataReadActivation({ env });
  if (!plan.enabled) {
    return Object.freeze({
      ...plan,
      binding: createFamilyDataReadGatewayBinding()
    });
  }

  const householdId = normalizeText(env.FAMILY_DATA_HOUSEHOLD_ID);
  if (!householdId) {
    throw new TypeError("FAMILY_DATA_HOUSEHOLD_ID is required when Family Data read runtime is enabled");
  }

  const scopedDb = requireDb(db);
  const scopedAuthenticator = requireAuthenticator(authenticator);

  const handler = createPostgresFamilyDataHttpReadBoundary({
    db: scopedDb,
    householdId,
    schema: plan.schema,
    tenantId: FAMILY_TENANT,
    generatedAt,
    requestId,
    authorize: async ({ scope, request, tenant_id }) => {
      const identity = await scopedAuthenticator.authenticate(request?.headers ?? {});
      if (!identity) return false;
      const principal = identity.principal ?? {};
      if (principal.tenantId !== tenant_id) return false;
      const scopes = Array.isArray(principal.scopes) ? principal.scopes : [];
      return scopes.includes(scope);
    }
  });

  return Object.freeze({
    ...plan,
    binding: createFamilyDataReadGatewayBinding({
      enabled: true,
      handler
    })
  });
}

export async function startFamilyDataReadActivation({
  env = process.env,
  db,
  authenticator,
  generatedAt,
  requestId,
  ...serverOptions
} = {}) {
  const activation = createFamilyDataReadActivation({
    env,
    db,
    authenticator,
    generatedAt,
    requestId
  });

  return startServerWithFamilyDataReadGate({
    ...serverOptions,
    enabled: activation.enabled,
    ...(activation.enabled ? { familyDataBinding: activation.binding } : {})
  });
}
