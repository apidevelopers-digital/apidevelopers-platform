import { assertCanonicalId, createCanonicalId } from "./canonical-ids.mjs";

const STATUSES = Object.freeze(["pending", "active", "suspended", "revoked"]);
const ONBOARDING_STATUSES = Object.freeze(["pending", "ready", "completed", "blocked"]);

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

export const saasAccessContractVersion = 1;

export function createAccessGrantId(tenantSlug, workspaceSlug, productId, principalId) {
  return createCanonicalId({ family: "component", segments: ["access", tenantSlug, workspaceSlug, productId, principalId] });
}

export function createAccessGrant(input = {}) {
  const grant = {
    accessGrantId: requireText(input.accessGrantId, "accessGrantId"),
    principalId: requireText(input.principalId, "principalId"),
    tenantId: requireText(input.tenantId, "tenantId"),
    workspaceId: requireText(input.workspaceId, "workspaceId"),
    productId: requireText(input.productId, "productId"),
    subscriptionId: requireText(input.subscriptionId, "subscriptionId"),
    entitlementId: requireText(input.entitlementId, "entitlementId"),
    requiredScopes: Array.isArray(input.requiredScopes)
      ? [...new Set(input.requiredScopes.map((x) => requireText(x, "requiredScope"))]
      : [],
    status: input.status ?? "pending",
    createdAt: requireText(input.createdAt, "createdAt"),
    activatedAt: input.activatedAt ? requireText(input.activatedAt, "activatedAt") : null,
  };
  assertCanonicalId(grant.accessGrantId, { expectedFamily: "component" });
  for (const id of [grant.tenantId, grant.workspaceId, grant.subscriptionId, grant.entitlementId]) {
    assertCanonicalId(id, { expectedFamily: "component" });
  }
  if (!STATUSES.includes(grant.status)) throw new RangeError("invalid access grant status");
  if (grant.status === "active" && !grant.activatedAt) throw new Error("active access grant requires activatedAt");
  return Object.freeze(grant);
}

export function createOnboardingState(input = {}) {
  const state = {
    tenantId: requireText(input.tenantId, "tenantId"),
    workspaceId: requireText(input.workspaceId, "workspaceId"),
    productId: requireText(input.productId, "productId"),
    status: input.status ?? "pending",
    requiredSteps: Array.isArray(input.requiredSteps)
      ? [...new Set(input.requiredSteps.map((x) => requireText(x, "requiredStep"))]
      : [],
    completedSteps: Array.isArray(input.completedSteps)
      ? [...new Set(input.completedSteps.map((x) => requireText(x, "completedStep"))]
      : [],
    updatedAt: requireText(input.updatedAt, "updatedAt"),
  };
  for (const id of [state.tenantId, state.workspaceId]) {
    assertCanonicalId(id, { expectedFamily: "component" });
  }
  if (!ONBOARDING_STATUSES.includes(state.status)) throw new RangeError("invalid onboarding status");
  return Object.freeze(state);
}

export function assertAutomatedAccessReadiness({subscription, entitlement, provisioningJob, grant} = {}) {
  if (!subscription || subscription.status !== "active") throw new Error("access requires active subscription");
  if (!entitlement || entitlement.status !== "active") throw new Error("access requires active entitlement");
  if (!provisioningJob || provisioningJob.status !== "succeeded") throw new Error("access requires succeeded provisioning");
  if (!grant) throw new Error("access grant required");

  const checks = [
    ["subscriptionId", subscription.subscriptionId],
    ["tenantId", subscription.tenantId],
    ["productId", subscription.productId],
  ];
  for (const [field, expected] of checks) {
    if (grant[field] !== expected) throw new Error("access binding mismatch");
  }

  if (
    grant.entitlementId !== entitlement.entitlementId ||
    grant.workspaceId !== entitlement.workspaceId ||
    grant.workspaceId !== provisioningJob.workspaceId ||
    grant.tenantId !== entitlement.tenantId ||
    grant.tenantId !== provisioningJob.tenantId ||
    grant.productId !== entitlement.productId ||
    grant.productId !== provisioningJob.productId
  ) {
    throw new Error("access workspace binding mismatch");
  }
  return true;
}

export { STATUSES as accessGrantStatuses, ONBOARDING_STATUSES as onboardingStatuses };
