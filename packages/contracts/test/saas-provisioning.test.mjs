import test from "node:test";
import assert from "node:assert/strict";
import {
  createEntitlement,
  createEntitlementId,
  createSubscription,
  createSubscriptionId,
} from "../src/saas-commercial.mjs";
import {
  createTenantId,
  createWorkspaceId,
} from "../src/saas-tenancy.mjs";
import {
  assertProvisioningJobInputs,
  createProvisioningJob,
  createProvisioningJobId,
  transitionProvisioningJob,
} from "../src/saas-provisioning.mjs";

const requestedAt = "2026-08-10T00:00:00.000Z";

function fixture() {
  const tenantId = createTenantId("acme");
  const workspaceId = createWorkspaceId("acme", "zuni-main");
  const subscription = createSubscription({
    subscriptionId: createSubscriptionId("acme", "zuni"),
    tenantId,
    productId: "zuni",
    planId: "pro",
    status: "assisted_activation",
    currency: "BRL",
    monthlyAmount: 597,
    createdAt: requestedAt,
  });
  const entitlement = createEntitlement({
    entitlementId: createEntitlementId("acme", "zuni-main", "templates"),
    subscriptionId: subscription.subscriptionId,
    tenantId,
    workspaceId,
    productId: "zuni",
    capability: "templates",
    status: "pending",
    sourcePlanId: "pro",
    createdAt: requestedAt,
  });
  const job = createProvisioningJob({
    provisioningJobId: createProvisioningJobId("acme", "zuni-main", "zuni"),
    subscriptionId: subscription.subscriptionId,
    tenantId,
    workspaceId,
    productId: "zuni",
    entitlementIds: [entitlement.entitlementId],
    idempotencyKey: "acme:zuni-main:zuni:v1",
    requestedAt,
  });
  return { subscription, entitlement, job };
}

test("creates a queued provisioning job bound to subscription and entitlements", () => {
  const { subscription, entitlement, job } = fixture();
  assert.equal(job.status, "queued");
  assert.equal(job.attempt, 0);
  assert.equal(job.idempotencyKey, "acme:zuni-main:zuni:v1");
  assert.equal(assertProvisioningJobInputs(subscription, [entitlement], job), true);
});

test("provisioning job is fail-closed on workspace boundary", () => {
  const { subscription, entitlement, job } = fixture();
  const wrongWorkspaceEntitlement = createEntitlement({
    ...entitlement,
    entitlementId: createEntitlementId("acme", "other", "templates"),
    workspaceId: createWorkspaceId("acme", "other"),
  });
  assert.throws(
    () => assertProvisioningJobInputs(subscription, [wrongWorkspaceEntitlement], job),
    /workspace boundary mismatch|entitlement set mismatch/,
  );
});

test("supports recoverable retry after explicit failure", () => {
  const { job } = fixture();
  const running = transitionProvisioningJob(job, {
    status: "running",
    at: "2026-08-10T01:00:00.000Z",
  });
  const failed = transitionProvisioningJob(running, {
    status: "failed",
    at: "2026-08-10T01:01:00.000Z",
    errorCode: "provider_unavailable",
  });
  const retried = transitionProvisioningJob(failed, {
    status: "queued",
    at: "2026-08-10T01:02:00.000Z",
  });
  assert.equal(failed.errorCode, "provider_unavailable");
  assert.equal(retried.status, "queued");
  assert.equal(retried.attempt, 1);
  assert.equal(retried.idempotencyKey, job.idempotencyKey);
  assert.equal(retried.startedAt, null);
  assert.equal(retried.completedAt, null);
});

test("succeeded provisioning requires explicit result evidence", () => {
  const { job } = fixture();
  const running = transitionProvisioningJob(job, {
    status: "running",
    at: "2026-08-10T01:00:00.000Z",
  });
  assert.throws(
    () => transitionProvisioningJob(running, {
      status: "succeeded",
      at: "2026-08-10T01:01:00.000Z",
    }),
    /requires object result/,
  );
  const succeeded = transitionProvisioningJob(running, {
    status: "succeeded",
    at: "2026-08-10T01:01:00.000Z",
    result: {
      tenantReady: true,
      workspaceReady: true,
      productReady: true,
    },
  });
  assert.equal(succeeded.status, "succeeded");
  assert.equal(succeeded.result.productReady, true);
});

test("does not allow terminal provisioning jobs to transition again", () => {
  const { job } = fixture();
  const cancelled = transitionProvisioningJob(job, {
    status: "cancelled",
    at: "2026-08-10T01:00:00.000Z",
  });
  assert.throws(
    () => transitionProvisioningJob(cancelled, {
      status: "queued",
      at: "2026-08-10T01:01:00.000Z",
    }),
    /invalid provisioning transition/,
  );
});
