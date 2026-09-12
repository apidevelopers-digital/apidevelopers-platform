import { createProvisioningJobId } from "../../contracts/src/saas-provisioning.mjs";

const WRITE_AUTHORIZATION = "ZUNI_SAAS_ACTIVATION_WRITE_V1";

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}
function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function comparableRecord(record) {
  if (!record) return null;
  const copy = { ...record };
  return copy;
}
function assertSameRecord(existing, expected, label) {
  const left = JSON.stringify(comparableRecord(existing));
  const right = JSON.stringify(comparableRecord(expected));
  if (left !== right) {
    throw new Error(`${label} already exists with a conflicting record`);
  }
}

function comparableProvisioningIdentity(record) {
  if (!record) return null;
  return {
    provisioningJobId: record.provisioningJobId,
    subscriptionId: record.subscriptionId,
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    productId: record.productId,
    entitlementIds: Array.isArray(record.entitlementIds)
      ? [...record.entitlementIds].sort()
      : record.entitlementIds,
    idempotencyKey: record.idempotencyKey,
  };
}

function assertSameProvisioningIdentity(existing, expected) {
  const left = JSON.stringify(comparableProvisioningIdentity(existing));
  const right = JSON.stringify(comparableProvisioningIdentity(expected));
  if (left !== right) {
    throw new Error("provisioning job already exists with a conflicting identity");
  }
}

function createAuditEvent({ activationPlan, stage, outcome, details = {}, at }) {
  return Object.freeze({
    schemaVersion: 1,
    eventType: "zuni.saas.activation",
    correlationId: activationPlan.correlationId,
    tenantId: activationPlan.tenant.tenantId,
    workspaceId: activationPlan.workspace.workspaceId,
    subscriptionId: activationPlan.subscription.subscriptionId,
    planId: activationPlan.planId,
    stage,
    outcome,
    at,
    details: Object.freeze({ ...details }),
  });
}

export function buildZuniActivationExecutionPlan({
  activationPlan,
  requestedAt = new Date().toISOString(),
} = {}) {
  requireObject(activationPlan, "activationPlan");
  requireText(activationPlan.correlationId, "activationPlan.correlationId");
  requireObject(activationPlan.tenant, "activationPlan.tenant");
  requireObject(activationPlan.workspace, "activationPlan.workspace");
  requireObject(activationPlan.subscription, "activationPlan.subscription");
  if (!Array.isArray(activationPlan.entitlements) || activationPlan.entitlements.length === 0) {
    throw new TypeError("activationPlan.entitlements must contain at least one entitlement");
  }
  if (activationPlan.productionWriteAuthorized !== false) {
    throw new Error("activationPlan must remain productionWriteAuthorized=false before governed execution");
  }
  if (activationPlan.automaticCharge !== false) {
    throw new Error("activationPlan must remain automaticCharge=false");
  }

  const provisioningJobId = createProvisioningJobId(
    activationPlan.tenant.slug,
    activationPlan.workspace.slug,
    activationPlan.productId,
  );
  const entitlementIds = activationPlan.entitlements.map(({ record }) => record.entitlementId);

  return Object.freeze({
    schemaVersion: 1,
    mode: "governed-activation",
    correlationId: activationPlan.correlationId,
    requestedAt,
    productionWriteAuthorized: false,
    automaticCharge: false,
    steps: Object.freeze([
      "register-tenant-workspace",
      "start-subscription",
      "grant-entitlements",
      "enqueue-provisioning",
    ]),
    provisioningJob: Object.freeze({
      provisioningJobId,
      subscriptionId: activationPlan.subscription.subscriptionId,
      tenantId: activationPlan.tenant.tenantId,
      workspaceId: activationPlan.workspace.workspaceId,
      productId: activationPlan.productId,
      entitlementIds: Object.freeze([...entitlementIds]),
      idempotencyKey: `zuni-activation:${activationPlan.correlationId}`,
      status: "queued",
      requestedAt,
    }),
    rollback: Object.freeze({
      automaticDelete: false,
      strategy: "compensating-actions-only",
      notes: Object.freeze([
        "do not delete tenant/workspace automatically",
        "keep subscription out of active state until explicit activation",
        "keep entitlements pending until provisioning succeeds",
        "queued provisioning may be cancelled before execution",
      ]),
    }),
  });
}

export async function executeZuniActivationPlan({
  runtime,
  activationPlan,
  audit,
  mode = "dry-run",
  authorization = null,
  requestedAt = new Date().toISOString(),
} = {}) {
  requireObject(runtime, "runtime");
  const writeAudit = requireFunction(audit, "audit");
  const executionPlan = buildZuniActivationExecutionPlan({ activationPlan, requestedAt });

  if (mode === "dry-run") {
    await writeAudit(createAuditEvent({
      activationPlan,
      stage: "dry-run",
      outcome: "planned",
      details: {
        steps: executionPlan.steps,
        provisioningJobId: executionPlan.provisioningJob.provisioningJobId,
      },
      at: requestedAt,
    }));
    return Object.freeze({
      executed: false,
      writeAuthorized: false,
      executionPlan,
    });
  }

  if (mode !== "write") {
    throw new Error(`unsupported activation mode: ${mode}`);
  }
  if (authorization !== WRITE_AUTHORIZATION) {
    throw new Error("governed activation write authorization is required");
  }

  for (const method of [
    "registerTenantWorkspace",
    "startSubscription",
    "grantEntitlement",
    "enqueueProvisioning",
    "getTenant",
    "getWorkspace",
    "getSubscription",
    "getEntitlement",
    "getProvisioningJob",
  ]) {
    requireFunction(runtime[method], `runtime.${method}`);
  }

  await writeAudit(createAuditEvent({
    activationPlan,
    stage: "write",
    outcome: "started",
    details: {
      provisioningJobId: executionPlan.provisioningJob.provisioningJobId,
    },
    at: requestedAt,
  }));

  const existingTenant = await runtime.getTenant(activationPlan.tenant.tenantId);
  const existingWorkspace = await runtime.getWorkspace(activationPlan.workspace.workspaceId);

  if (existingTenant) assertSameRecord(existingTenant, activationPlan.tenant, "tenant");
  if (existingWorkspace) assertSameRecord(existingWorkspace, activationPlan.workspace, "workspace");

  if (!existingTenant || !existingWorkspace) {
    await runtime.registerTenantWorkspace({
      tenant: activationPlan.tenant,
      workspace: activationPlan.workspace,
    });
  }

  const existingSubscription = await runtime.getSubscription(activationPlan.subscription.subscriptionId);
  if (existingSubscription) {
    assertSameRecord(existingSubscription, activationPlan.subscription, "subscription");
  } else {
    await runtime.startSubscription(activationPlan.subscription);
  }

  let createdEntitlements = 0;
  for (const { record } of activationPlan.entitlements) {
    const existing = await runtime.getEntitlement(record.entitlementId);
    if (existing) {
      assertSameRecord(existing, record, `entitlement ${record.entitlementId}`);
      continue;
    }
    await runtime.grantEntitlement(record);
    createdEntitlements += 1;
  }

  const existingJob = await runtime.getProvisioningJob(executionPlan.provisioningJob.provisioningJobId);
  let provisioning;
  if (existingJob) {
    assertSameProvisioningIdentity(existingJob, executionPlan.provisioningJob);
    provisioning = Object.freeze({ executed: false, job: existingJob });
  } else {
    provisioning = await runtime.enqueueProvisioning(executionPlan.provisioningJob);
  }

  await writeAudit(createAuditEvent({
    activationPlan,
    stage: "write",
    outcome: "persisted",
    details: {
      tenantCreated: !existingTenant,
      workspaceCreated: !existingWorkspace,
      subscriptionCreated: !existingSubscription,
      entitlementsCreated: createdEntitlements,
      provisioningEnqueued: !existingJob,
      provisioningJobId: executionPlan.provisioningJob.provisioningJobId,
    },
    at: requestedAt,
  }));

  return Object.freeze({
    executed: true,
    writeAuthorized: true,
    executionPlan,
    result: Object.freeze({
      tenantCreated: !existingTenant,
      workspaceCreated: !existingWorkspace,
      subscriptionCreated: !existingSubscription,
      entitlementsCreated: createdEntitlements,
      provisioningEnqueued: !existingJob,
      provisioning,
    }),
  });
}

export { WRITE_AUTHORIZATION as ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION };
