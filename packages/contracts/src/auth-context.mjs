const VERSION = 1;
const PRINCIPAL_TYPES = new Set(["user", "service_account", "api_key", "session", "external_identity"]);
const CREDENTIAL_TYPES = new Set(["password", "api_key", "session", "federated", "service_credential"]);
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{2,127}$/i;

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
}
function string(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
}
function safeId(value, name) {
  string(value, name);
  if (!SAFE_ID.test(value) || value.includes("@")) throw new Error(`${name} must be an opaque safe identifier`);
}
function iso(value, name) {
  string(value, name);
  if (Number.isNaN(Date.parse(value))) throw new Error(`${name} must be an ISO date`);
}
function strings(value, name) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return [...new Set(value.map((item, index) => {
    string(item, `${name}[${index}]`);
    return item.trim();
  }))].sort();
}
function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

export const authContextContractVersion = VERSION;

export function assertAuthContextContract(context, name = "authContext") {
  object(context, name);
  if (context.schemaVersion !== VERSION) throw new Error(`${name}.schemaVersion must be ${VERSION}`);
  safeId(context.authenticationId, `${name}.authenticationId`);
  iso(context.authenticatedAt, `${name}.authenticatedAt`);

  object(context.principal, `${name}.principal`);
  safeId(context.principal.principalId, `${name}.principal.principalId`);
  if (!PRINCIPAL_TYPES.has(context.principal.type)) throw new Error(`${name}.principal.type is invalid`);
  if (context.principal.status !== "active") throw new Error(`${name}.principal.status must be active`);

  object(context.credential, `${name}.credential`);
  safeId(context.credential.credentialId, `${name}.credential.credentialId`);
  if (!CREDENTIAL_TYPES.has(context.credential.type)) throw new Error(`${name}.credential.type is invalid`);
  if (context.credential.status !== "active") throw new Error(`${name}.credential.status must be active`);
  iso(context.credential.issuedAt, `${name}.credential.issuedAt`);
  iso(context.credential.expiresAt, `${name}.credential.expiresAt`);
  if (context.credential.revokedAt !== null) throw new Error(`${name}.credential.revokedAt must be null`);
  if (context.credential.secretMaterialIncluded !== false) throw new Error(`${name}.credential.secretMaterialIncluded must be false`);

  strings(context.scopes, `${name}.scopes`);
  if (context.authenticated !== true) throw new Error(`${name}.authenticated must be true`);
  if (context.authorized !== false) throw new Error(`${name}.authorized must be false`);
  if (context.tenantId !== null) throw new Error(`${name}.tenantId must be null`);

  object(context.audit, `${name}.audit`);
  safeId(context.audit.requestId, `${name}.audit.requestId`);
  safeId(context.audit.correlationId, `${name}.audit.correlationId`);

  object(context.constraints, `${name}.constraints`);
  for (const field of ["permissionRequired", "tenancyRequired"]) {
    if (context.constraints[field] !== true) throw new Error(`${name}.constraints.${field} must be true`);
  }
  for (const field of ["secretsExposed", "automaticAuthorizationAllowed", "crossTenantAccessAllowed"]) {
    if (context.constraints[field] !== false) throw new Error(`${name}.constraints.${field} must be false`);
  }
  return context;
}

export function createAuthContext({
  authenticationId,
  principal,
  credential,
  scopes = [],
  requestId,
  correlationId,
  authenticatedAt = new Date().toISOString(),
} = {}) {
  const context = {
    schemaVersion: VERSION,
    authenticationId,
    authenticatedAt,
    principal: structuredClone(principal),
    credential: {
      credentialId: credential?.credentialId,
      type: credential?.type,
      status: credential?.status,
      issuedAt: credential?.issuedAt,
      expiresAt: credential?.expiresAt,
      revokedAt: null,
      secretMaterialIncluded: false,
    },
    scopes: strings(scopes, "scopes"),
    authenticated: true,
    authorized: false,
    tenantId: null,
    audit: { requestId, correlationId },
    constraints: {
      permissionRequired: true,
      tenancyRequired: true,
      secretsExposed: false,
      automaticAuthorizationAllowed: false,
      crossTenantAccessAllowed: false,
    },
  };
  assertAuthContextContract(context);
  return freeze(context);
}
