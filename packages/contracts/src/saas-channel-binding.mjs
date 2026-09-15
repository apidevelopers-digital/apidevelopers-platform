import { assertCanonicalId, createCanonicalId } from "./canonical-ids.mjs";

export const saasChannelBindingContractVersion = 1;

const STATUSES = new Set(["active", "disabled"]);
const FORBIDDEN_SECRET_FIELDS = new Set([
  "accessToken",
  "access_token",
  "token",
  "secret",
  "appSecret",
  "app_secret",
  "credential",
  "credentialEnvelope",
  "credentialValue",
]);

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function requireIsoDate(value, name) {
  const text = requireText(value, name);
  if (Number.isNaN(Date.parse(text))) {
    throw new TypeError(`${name} must be an ISO-8601 date`);
  }
  return text;
}

function rejectSecretMaterial(input) {
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_SECRET_FIELDS.has(key)) {
      throw new TypeError(`channel binding must not contain secret material: ${key}`);
    }
  }
}

export function createChannelBindingId(tenantSlug, workspaceSlug, channelId) {
  return createCanonicalId({
    family: "component",
    segments: [
      "channel-binding",
      requireText(tenantSlug, "tenantSlug").toLowerCase(),
      requireText(workspaceSlug, "workspaceSlug").toLowerCase(),
      requireText(channelId, "channelId").toLowerCase(),
    ],
  });
}

export function createSaasChannelBinding(input = {}) {
  requireObject(input, "input");
  rejectSecretMaterial(input);

  const {
    bindingId,
    tenantId,
    workspaceId,
    productId,
    provider,
    channelType,
    channelId,
    wabaId,
    phoneNumberId,
    credentialRef,
    status = "active",
    createdAt = new Date().toISOString(),
    updatedAt = createdAt,
  } = input;

  assertCanonicalId(bindingId, { expectedFamily: "component" });
  assertCanonicalId(tenantId, { expectedFamily: "component" });
  assertCanonicalId(workspaceId, { expectedFamily: "component" });

  const normalizedProductId = requireText(productId, "productId").toLowerCase();
  const normalizedProvider = requireText(provider, "provider").toLowerCase();
  const normalizedChannelType = requireText(channelType, "channelType").toLowerCase();
  const normalizedChannelId = requireText(channelId, "channelId");
  const normalizedWabaId = requireText(wabaId, "wabaId");
  const normalizedPhoneNumberId = requireText(phoneNumberId, "phoneNumberId");
  const normalizedCredentialRef = requireText(credentialRef, "credentialRef");

  if (normalizedProductId !== "zuni") {
    throw new TypeError("channel binding productId must be zuni");
  }
  if (normalizedProvider !== "meta") {
    throw new TypeError("channel binding provider must be meta");
  }
  if (normalizedChannelType !== "whatsapp_business") {
    throw new TypeError("channel binding channelType must be whatsapp_business");
  }
  if (!STATUSES.has(status)) {
    throw new TypeError("channel binding status is invalid");
  }
  if (normalizedCredentialRef.length > 512) {
    throw new TypeError("credentialRef must be 512 characters or fewer");
  }

  return Object.freeze({
    schemaVersion: saasChannelBindingContractVersion,
    bindingId,
    tenantId,
    workspaceId,
    productId: normalizedProductId,
    provider: normalizedProvider,
    channelType: normalizedChannelType,
    channelId: normalizedChannelId,
    wabaId: normalizedWabaId,
    phoneNumberId: normalizedPhoneNumberId,
    credentialRef: normalizedCredentialRef,
    status,
    createdAt: requireIsoDate(createdAt, "createdAt"),
    updatedAt: requireIsoDate(updatedAt, "updatedAt"),
  });
}
