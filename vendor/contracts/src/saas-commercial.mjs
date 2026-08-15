import { assertCanonicalId, createCanonicalId } from "./canonical-ids.mjs";

export const saasCommercialContractVersion = 1;

export const subscriptionStatuses = Object.freeze([
  "lead",
  "assisted_activation",
  "trial",
  "active",
  "past_due",
  "suspended",
  "cancelled",
]);

export const entitlementStatuses = Object.freeze([
  "pending",
  "active",
  "suspended",
  "revoked",
]);

const SUBSCRIPTION_STATUS_SET = new Set(subscriptionStatuses);
const ENTITLEMENT_STATUS_SET = new Set(entitlementStatuses);

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertIsoDate(value, name) {
  assertNonEmptyString(value, name);
  if (Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} must be an ISO-8601 date`);
  }
}

function assertStatus(value, allowed, name) {
  if (!allowed.has(value)) {
    throw new TypeError(`${name} is invalid`);
  }
}

function assertMoney({ currency, monthlyAmount }) {
  assertNonEmptyString(currency, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new TypeError("currency must be an ISO-4217 style code");
  }
  if (!Number.isInteger(monthlyAmount) || monthlyAmount < 0) {
    throw new TypeError("monthlyAmount must be a non-negative integer in major currency units");
  }
}

export function createSubscription({
  subscriptionId,
  tenantId,
  productId,
  planId,
  status = "assisted_activation",
  currency = "BRL",
  monthlyAmount,
  createdAt = new Date().toISOString(),
  activatedAt = null,
} = {}) {
  assertCanonicalId(subscriptionId, { expectedFamily: "component" });
  assertCanonicalId(tenantId, { expectedFamily: "component" });
  assertNonEmptyString(productId, "productId");
  assertNonEmptyString(planId, "planId");
  assertStatus(status, SUBSCRIPTION_STATUS_SET, "status");
  assertMoney({ currency, monthlyAmount });
  assertIsoDate(createdAt, "createdAt");
  if (activatedAt !== null) {
    assertIsoDate(activatedAt, "activatedAt");
  }
  if (status === "active" && activatedAt === null) {
    throw new TypeError("active subscription requires activatedAt");
  }

  return Object.freeze({
    schemaVersion: saasCommercialContractVersion,
    subscriptionId,
    tenantId,
    productId: productId.trim().toLowerCase(),
    planId: planId.trim().toLowerCase(),
    status,
    currency,
    monthlyAmount,
    createdAt,
    activatedAt,
  });
}

export function createEntitlement({
  entitlementId,
  subscriptionId,
  tenantId,
  workspaceId,
  productId,
  capability,
  status = "pending",
  sourcePlanId,
  createdAt = new Date().toISOString(),
} = {}) {
  assertCanonicalId(entitlementId, { expectedFamily: "component" });
  assertCanonicalId(subscriptionId, { expectedFamily: "component" });
  assertCanonicalId(tenantId, { expectedFamily: "component" });
  assertCanonicalId(workspaceId, { expectedFamily: "component" });
  assertNonEmptyString(productId, "productId");
  assertNonEmptyString(capability, "capability");
  assertNonEmptyString(sourcePlanId, "sourcePlanId");
  assertStatus(status, ENTITLEMENT_STATUS_SET, "status");
  assertIsoDate(createdAt, "createdAt");

  return Object.freeze({
    schemaVersion: saasCommercialContractVersion,
    entitlementId,
    subscriptionId,
    tenantId,
    workspaceId,
    productId: productId.trim().toLowerCase(),
    capability: capability.trim().toLowerCase(),
    status,
    sourcePlanId: sourcePlanId.trim().toLowerCase(),
    createdAt,
  });
}

export function assertSubscriptionEntitlementBinding(subscription, entitlement) {
  if (!subscription || typeof subscription !== "object") {
    throw new TypeError("subscription must be an object");
  }
  if (!entitlement || typeof entitlement !== "object") {
    throw new TypeError("entitlement must be an object");
  }
  if (
    subscription.schemaVersion !== saasCommercialContractVersion ||
    entitlement.schemaVersion !== saasCommercialContractVersion
  ) {
    throw new TypeError("unsupported commercial contract schema version");
  }
  if (subscription.subscriptionId !== entitlement.subscriptionId) {
    throw new Error("entitlement subscription boundary mismatch");
  }
  if (subscription.tenantId !== entitlement.tenantId) {
    throw new Error("entitlement tenant boundary mismatch");
  }
  if (subscription.productId !== entitlement.productId) {
    throw new Error("entitlement product boundary mismatch");
  }
  if (subscription.planId !== entitlement.sourcePlanId) {
    throw new Error("entitlement plan source mismatch");
  }
  return true;
}

export function createSubscriptionId(tenantSlug, productId) {
  assertNonEmptyString(tenantSlug, "tenantSlug");
  assertNonEmptyString(productId, "productId");
  return createCanonicalId({
    family: "component",
    segments: [
      "subscription",
      tenantSlug.trim().toLowerCase(),
      productId.trim().toLowerCase(),
    ],
  });
}

export function createEntitlementId(tenantSlug, workspaceSlug, capability) {
  assertNonEmptyString(tenantSlug, "tenantSlug");
  assertNonEmptyString(workspaceSlug, "workspaceSlug");
  assertNonEmptyString(capability, "capability");
  return createCanonicalId({
    family: "component",
    segments: [
      "entitlement",
      tenantSlug.trim().toLowerCase(),
      workspaceSlug.trim().toLowerCase(),
      capability.trim().toLowerCase(),
    ],
  });
}
