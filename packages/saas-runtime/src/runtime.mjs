import {
  createTenant,
  createWorkspace,
  assertTenantWorkspaceBinding,
} from "../../contracts/src/saas-tenancy.mjs";
import {
  createSubscription,
  createEntitlement,
  assertSubscriptionEntitlementBinding,
} from "../../contracts/src/saas-commercial.mjs";
import {
  createProvisioningJob,
  assertProvisioningJobInputs,
  transitionProvisioningJob,
} from "../../contracts/src/saas-provisioning.mjs";
import {
  createDurableRepository,
} from "../../persistence-core/src/index.mjs";

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function createSaasRuntime({ store, clock = () => new Date().toISOString() } = {}) {
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    throw new TypeError("store must provide read and transaction");
  }
  if (typeof store.executeIdempotent !== "function") {
    throw new TypeError("store must provide executeIdempotent");
  }
  if (typeof clock !== "function") {
    throw new TypeError("clock must be a function");
  }

  const tenants = createDurableRepository({ store, collection: "saas.tenants", idField: "tenantId" });
  const workspaces = createDurableRepository({ store, collection: "saas.workspaces", idField: "workspaceId" });
  const subscriptions = createDurableRepository({ store, collection: "saas.subscriptions", idField: "subscriptionId" });
  const entitlements = createDurableRepository({ store, collection: "saas.entitlements", idField: "entitlementId" });
  const provisioningJobs = createDurableRepository({ store, collection: "saas.provisioningJobs", idField: "provisioningJobId" });

  async function registerTenantWorkspace({ tenant: tenantInput, workspace: workspaceInput } = {}) {
    requireObject(tenantInput, "tenant");
    requireObject(workspaceInput, "workspace");
    const tenant = createTenant(tenantInput);
    const workspace = createWorkspace(workspaceInput);
    assertTenantWorkspaceBinding(tenant, workspace);

    const existingTenant = await tenants.getById(tenant.tenantId);
    if (!existingTenant) await tenants.create(tenant);

    const existingWorkspace = await workspaces.getById(workspace.workspaceId);
    if (!existingWorkspace) await workspaces.create(workspace);

    return Object.freeze({ tenant, workspace });
  }

  async function startSubscription(input) {
    const subscription = createSubscription(input);
    const tenant = await tenants.getById(subscription.tenantId);
    if (!tenant) throw new Error("subscription tenant not found");
    if (tenant.status !== "active") throw new Error("subscription tenant is not active");
    return subscriptions.create(subscription);
  }

  async function activateSubscription({ subscriptionId, activatedAt = clock() } = {}) {
    requireText(subscriptionId, "subscriptionId");
    const current = await subscriptions.getById(subscriptionId);
    if (!current) throw new Error("subscription not found");
    if (!["assisted_activation", "trial"].includes(current.status)) {
      throw new Error(`subscription status cannot activate: ${current.status}`);
    }
    const activated = createSubscription({
      ...current,
      status: "active",
      activatedAt,
    });
    await subscriptions.replace(activated);
    return activated;
  }

  async function grantEntitlement(input) {
    const entitlement = createEntitlement(input);
    const subscription = await subscriptions.getById(entitlement.subscriptionId);
    if (!subscription) throw new Error("entitlement subscription not found");
    assertSubscriptionEntitlementBinding(subscription, entitlement);

    const workspace = await workspaces.getById(entitlement.workspaceId);
    if (!workspace) throw new Error("entitlement workspace not found");
    if (workspace.tenantId !== entitlement.tenantId) {
      throw new Error("entitlement workspace tenant boundary mismatch");
    }
    if (workspace.productId !== entitlement.productId) {
      throw new Error("entitlement workspace product boundary mismatch");
    }
    return entitlements.create(entitlement);
  }

  async function enqueueProvisioning(input) {
    const job = createProvisioningJob(input);
    if (job.status !== "queued") {
      throw new Error("new provisioning job must be queued");
    }
    const subscription = await subscriptions.getById(job.subscriptionId);
    if (!subscription) throw new Error("provisioning subscription not found");
    const boundEntitlements = [];
    for (const entitlementId of job.entitlementIds) {
      const entitlement = await entitlements.getById(entitlementId);
      if (!entitlement) throw new Error(`provisioning entitlement not found: ${entitlementId}`);
      boundEntitlements.push(entitlement);
    }
    assertProvisioningJobInputs(subscription, boundEntitlements, job);

    const result = await store.executeIdempotent(
      `saas.provisioning:${job.idempotencyKey}`,
      async (tx) => {
        const existing = tx.get("saas.provisioningJobs", job.provisioningJobId);
        if (existing) return existing;
        tx.put("saas.provisioningJobs", job.provisioningJobId, job, { ifAbsent: true });
        return job;
      },
    );
    return Object.freeze({
      executed: result.result?.executed ?? result.executed ?? true,
      job: result.result?.value ?? result.value ?? result.result ?? job,
    });
  }

  async function transitionJob({ provisioningJobId, status, at = clock(), errorCode = null, result = null } = {}) {
    requireText(provisioningJobId, "provisioningJobId");
    requireText(status, "status");
    const current = await provisioningJobs.getById(provisioningJobId);
    if (!current) throw new Error("provisioning job not found");
    const next = transitionProvisioningJob(current, { status, at, errorCode, result });
    await provisioningJobs.replace(next);
    return next;
  }

  async function claimProvisioning({ provisioningJobId, at = clock() } = {}) {
    return transitionJob({ provisioningJobId, status: "running", at });
  }

  async function completeProvisioning({ provisioningJobId, result, at = clock() } = {}) {
    requireObject(result, "result");
    return transitionJob({ provisioningJobId, status: "succeeded", at, result });
  }

  async function failProvisioning({ provisioningJobId, errorCode, at = clock() } = {}) {
    requireText(errorCode, "errorCode");
    return transitionJob({ provisioningJobId, status: "failed", at, errorCode });
  }

  async function retryProvisioning({ provisioningJobId, at = clock() } = {}) {
    return transitionJob({ provisioningJobId, status: "queued", at });
  }

  return Object.freeze({
    registerTenantWorkspace,
    startSubscription,
    activateSubscription,
    grantEntitlement,
    enqueueProvisioning,
    claimProvisioning,
    completeProvisioning,
    failProvisioning,
    retryProvisioning,
    getTenant: (id) => tenants.getById(id),
    getWorkspace: (id) => workspaces.getById(id),
    getSubscription: (id) => subscriptions.getById(id),
    getEntitlement: (id) => entitlements.getById(id),
    getProvisioningJob: (id) => provisioningJobs.getById(id),
    listProvisioningJobs: (where = {}) => provisioningJobs.list({ where }),
  });
}
