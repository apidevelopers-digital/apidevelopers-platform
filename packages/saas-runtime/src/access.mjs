import { authorize } from "../../auth-core/src/authorize.mjs";
import { createDurableRepository } from "../../persistence-core/src/index.mjs";
import { createAccessGrant, createOnboardingState, assertAutomatedAccessReadiness } from "../../contracts/src/saas-access.mjs";

function key(tenantId, workspaceId, productId) {
  return `${tenantId}:${workspaceId}:${productId}`;
}

export function createAccessRuntime({ store, saasRuntime, clock = () => new Date().toISOString() } = {}) {
  if (!store || !saasRuntime) throw new TypeError("store and saasRuntime were required");
  const grants = createDurableRepository({ store, collection: "saas.accessGrants", idField: "accessGrantId" });
  const onboarding = createDurableRepository({ store, collection: "saas.onboarding", idField: "onboardingKey" });

  async function grantAccess(input) {
    const grant = createAccessGrant(input);
    const current = await grants.getById(grant.accessGrantId);
    if (current) return current;
    return grants.create(grant);
  }

  async function activateAccess({accessGrantId, provisioningJobId, at = clock()} = {}) {
    const grant = await grants.getById(accessGrantId);
    if (!grant) throw new Error("access grant not found");
    const subscription = await saasRuntime.getSubscription(grant.subscriptionId);
    const entitlement = await saasRuntime.getEntitlement(grant.entitlementId);
    const provisioningJob = await saasRuntime.getProvisioningJob(provisioningJobId);
    assertAutomatedAccessReadiness({subscription, entitlement, provisioningJob, grant});
    const next = createAccessGrant({ ...grant, status: "active", activatedAt: at });
    await grants.replace(next);
    return next;
  }

  async function evaluateAccess({identity, accessGrantId, tenantId, workspaceId, productId} = {}) {
    const grant = await grants.getById(accessGrantId);
    if (!grant || grant.status !== "active") return Object.freeze({ allowed: false, reason: "access_grant_inactive" });
    if (grant.tenantId !== tenantId || grant.workspaceId !== workspaceId || grant.productId !== productId) {
      return Object.freeze({ allowed: false, reason: "access_context_mismatch" });
    }
    const decision = authorize(identity, { scopes: grant.requiredScopes });
    return Object.freeze({ allowed: decision.allowed, reason: decision.reason, missingScopes: decision.missingScopes });
  }

  async function setOnboarding({tenantId, workspaceId, productId, status, requiredSteps = [], completedSteps = [], updatedAt = clock()} = {}) {
    const record = createOnboardingState({tenantId, workspaceId, productId, status, requiredSteps, completedSteps, updatedAt});
    const value = Object.freeze({ onboardingKey: key(tenantId, workspaceId, productId), ...record });
    const current = await onboarding.getById(value.onboardingKey);
    if (current) {
      await onboarding.replace(value);
      return value;
    }
    return onboarding.create(value);
  }

  return Object.freeze({ grantAccess, activateAccess, evaluateAccess, setOnboarding, getOnboarding: (tenantId, workspaceId, productId) => onboarding.getById(key(tenantId, workspaceId, productId)) });
}
