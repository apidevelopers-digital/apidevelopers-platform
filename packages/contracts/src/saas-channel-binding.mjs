export const saasChannelBindingContractVersion = 1;

const STATUSES = new Set(["active", "suspended", "disconnected"]);

function requireText(value, name) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${name} must be a non-empty string`);
  return text;
}

function requireIso(value, name) {
  const text = requireText(value, name);
  if (Number.isNaN(Date.parse(text))) throw new TypeError(`${name} must be an ISO-8601 date`);
  return text;
}

export function createSaasChannelBinding({
  bindingId,
  tenantId,
  workspaceId,
  provider,
  channelId,
  credentialRef,
  status = "active",
  metadata = {},
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
} = {}) {
  const normalized = {
    schemaVersion: saasChannelBindingContractVersion,
    bindingId: requireText(bindingId, "bindingId"),
    tenantId: requireText(tenantId, "tenantId"),
    workspaceId: requireText(workspaceId, "workspaceId"),
    provider: requireText(provider, "provider").toLowerCase(),
    channelId: requireText(channelId, "channelId"),
    credentialRef: requireText(credentialRef, "credentialRef"),
    status,
    metadata: Object.freeze({ ...metadata }),
    createdAt: requireIso(createdAt, "createdAt"),
    updatedAt: requireIso(updatedAt, "updatedAt"),
  };
  if (!STATUSES.has(normalized.status)) throw new TypeError("status is invalid");
  for (const key of ["accessToken", "token", "appSecret", "secret"]) {
    if (key in normalized.metadata) throw new Error(`channel binding metadata must not contain ${key}`);
  }
  return Object.freeze(normalized);
}
