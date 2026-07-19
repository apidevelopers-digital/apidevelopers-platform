const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,127}$/i;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function normalizeStringArray(value, name) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  const normalized = value.map((item, index) => {
    assertNonEmptyString(item, `${name}[${index}]`);
    return item.trim();
  });
  return [...new Set(normalized)].sort();
}

export const tenancyContextContractVersion = 1;

export function assertTenantContextContract(context, name = "tenantContext") {
  assertObject(context, name);

  if (context.schemaVersion !== tenancyContextContractVersion) {
    throw new Error(`${name}.schemaVersion must be ${tenancyContextContractVersion}`);
  }

  assertNonEmptyString(context.tenantId, `${name}.tenantId`);
  if (!TENANT_ID_PATTERN.test(context.tenantId)) {
    throw new Error(`${name}.tenantId must be opaque and contain only safe identifier characters`);
  }
  if (context.tenantId.includes("@")) {
    throw new Error(`${name}.tenantId must not contain an email address`);
  }
  if (context.tenantIdOpaque !== true) {
    throw new Error(`${name}.tenantIdOpaque must be true`);
  }
  if (context.isolationMode !== "strict") {
    throw new Error(`${name}.isolationMode must be strict`);
  }
  if (context.crossTenantAccessAllowed !== false) {
    throw new Error(`${name}.crossTenantAccessAllowed must be false`);
  }
  if (context.globalOperation !== false) {
    throw new Error(`${name}.globalOperation must be false`);
  }

  assertNonEmptyString(context.principalId, `${name}.principalId`);
  assertNonEmptyString(context.requestId, `${name}.requestId`);
  assertNonEmptyString(context.createdAt, `${name}.createdAt`);

  normalizeStringArray(context.roles, `${name}.roles`);
  normalizeStringArray(context.permissions, `${name}.permissions`);

  return context;
}

export function createTenantContext({
  tenantId,
  principalId,
  requestId,
  roles = [],
  permissions = [],
  createdAt = new Date().toISOString(),
} = {}) {
  const context = {
    schemaVersion: tenancyContextContractVersion,
    tenantId,
    tenantIdOpaque: true,
    isolationMode: "strict",
    crossTenantAccessAllowed: false,
    globalOperation: false,
    principalId,
    requestId,
    roles: normalizeStringArray(roles, "roles"),
    permissions: normalizeStringArray(permissions, "permissions"),
    createdAt,
  };

  assertTenantContextContract(context);
  return Object.freeze(clone(context));
}

export function assertSameTenant(left, right) {
  assertTenantContextContract(left, "leftTenantContext");
  assertTenantContextContract(right, "rightTenantContext");

  if (left.tenantId !== right.tenantId) {
    throw new Error("cross-tenant operation blocked");
  }

  return true;
}
