import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createJsonFileStore } from "../../persistence-core/src/index.mjs";
import {
  createTenantId,
  createWorkspaceId,
} from "../../contracts/src/saas-tenancy.mjs";
import {
  createSubscriptionId,
  createEntitlementId,
} from "../../contracts/src/saas-commercial.mjs";
import {
  createProvisioningJobId,
} from "../../contracts/src/saas-provisioning.mjs";
import { createCanonicalId } from "../../contracts/src/canonical-ids.mjs";
import { createSaasRuntime } from "../src/index.mjs";

const T0 = "2026-08-10T18:00:00.000Z";

async function withRuntime(work) {
  const dir = await mkdtemp(join(tmpdir(), "apd-saas-runtime-"));
  const filePath = join(dir, "state.json");
  const store = createJsonFileStore({ filePath, fsync: false, clock: () => T0 });
  const runtime = createSaasRuntime({ store, clock: () => T0 });
  try {
    return await work({ runtime, store, filePath });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function ids(tenantSlug = "acme", workspaceSlug = "zuni-main") {
  return {
    tenantId: createTenantId(tenantSlug),
    organizationId: createCanonicalId({ family: "component", segments: ["organization", tenantSlug] }),
    workspaceId: createWorkspaceId(tenantSlug, workspaceSlug),
    subscriptionId: createSubscriptionId(tenantSlug, "zuni"),
    entitlementId: createEntitlementId(tenantSlug, workspaceSlug, "templates"),
    provisioningJobId: createProvisioningJobId(tenantSlug, workspaceSlug, "zuni"),
  };
}

async function seed(runtime, tenantSlug = "acme", workspaceSlug = "zuni-main") {
  const x = ids(tenantSlug, workspaceSlug);
  await runtime.registerTenantWorkspace({
    tenant: {
      tenantId: x.tenantId,
      organizationId: x.organizationId,
      slug: tenantSlug,
      displayName: "Acme",
      status: "active",
      createdAt: T0,
    },
    workspace: {
      workspaceId: x.workspaceId,
      tenantId: x.tenantId,
      productId: "zuni",
      slug: workspaceSlug,
      displayName: "Zuni Main",
      status: "active",
      createdAt: T0,
    },
  });
  await runtime.startSubscription({
    subscriptionId: x.subscriptionId,
    tenantId: x.tenantId,
    productId: "zuni",
    planId: "pro",
    status: "assisted_activation",
    currency: "BRL",
    monthlyAmount: 597,
    createdAt: T0,
  });
  await runtime.activateSubscription({
    subscriptionId: x.subscriptionId,
    activatedAt: "2026-08-10T18:01:00.000Z",
  });
  await runtime.grantEntitlement({
    entitlementId: x.entitlementId,
    subscriptionId: x.subscriptionId,
    tenantId: x.tenantId,
    workspaceId: x.workspaceId,
    productId: "zuni",
    capability: "templates",
    status: "active",
    sourcePlanId: "pro",
    createdAt: T0,
  });
  return x;
}

test("persists Zuni SaaS commercial state and provisioning lifecycle", async () => {
  await withRuntime(async ({ runtime, store }) => {
    const x = await seed(runtime);
    const enqueued = await runtime.enqueueProvisioning({
      provisioningJobId: x.provisioningJobId,
      subscriptionId: x.subscriptionId,
      tenantId: x.tenantId,
      workspaceId: x.workspaceId,
      productId: "zuni",
      entitlementIds: [x.entitlementId],
      idempotencyKey: "acme:zuni-main:zuni:v1",
      requestedAt: T0,
    });
    assert.equal(enqueued.job.status, "queued");

    const running = await runtime.claimProvisioning({
      provisioningJobId: x.provisioningJobId,
      at: "2026-08-10T18:02:00.000Z",
    });
    assert.equal(running.status, "running");

    const succeeded = await runtime.completeProvisioning({
      provisioningJobId: x.provisioningJobId,
      at: "2026-08-10T18:03:00.000Z",
      result: { tenantReady: true, workspaceReady: true, productReady: true },
    });
    assert.equal(succeeded.status, "succeeded");

    const reopened = createSaasRuntime({ store, clock: () => T0 });
    const persisted = await reopened.getProvisioningJob(x.provisioningJobId);
    assert.equal(persisted.status, "succeeded");
    assert.equal(persisted.result.productReady, true);
  });
});

test("deduplicates provisioning by idempotency key", async () => {
  await withRuntime(async ({ runtime }) => {
    const x = await seed(runtime);
    const payload = {
      provisioningJobId: x.provisioningJobId,
      subscriptionId: x.subscriptionId,
      tenantId: x.tenantId,
      workspaceId: x.workspaceId,
      productId: "zuni",
      entitlementIds: [x.entitlementId],
      idempotencyKey: "acme:zuni-main:zuni:v1",
      requestedAt: T0,
    };
    const first = await runtime.enqueueProvisioning(payload);
    const second = await runtime.enqueueProvisioning(payload);
    assert.equal(first.job.provisioningJobId, second.job.provisioningJobId);
    const jobs = await runtime.listProvisioningJobs({ tenantId: x.tenantId });
    assert.equal(jobs.length, 1);
  });
});

test("blocks cross-tenant entitlement binding at runtime", async () => {
  await withRuntime(async ({ runtime }) => {
    const acme = await seed(runtime);
    const other = ids("other", "zuni-main");
    await runtime.registerTenantWorkspace({
      tenant: {
        tenantId: other.tenantId,
        organizationId: other.organizationId,
        slug: "other",
        displayName: "Other",
        status: "active",
        createdAt: T0,
      },
      workspace: {
        workspaceId: other.workspaceId,
        tenantId: other.tenantId,
        productId: "zuni",
        slug: "zuni-main",
        displayName: "Other Zuni",
        status: "active",
        createdAt: T0,
      },
    });

    await assert.rejects(
      () => runtime.grantEntitlement({
        entitlementId: createEntitlementId("acme", "zuni-main", "cross-tenant"),
        subscriptionId: acme.subscriptionId,
        tenantId: acme.tenantId,
        workspaceId: other.workspaceId,
        productId: "zuni",
        capability: "cross-tenant",
        status: "active",
        sourcePlanId: "pro",
        createdAt: T0,
      }),
      /workspace tenant boundary mismatch/,
    );
  });
});

test("supports explicit failed provisioning retry without changing idempotency key", async () => {
  await withRuntime(async ({ runtime }) => {
    const x = await seed(runtime);
    await runtime.enqueueProvisioning({
      provisioningJobId: x.provisioningJobId,
      subscriptionId: x.subscriptionId,
      tenantId: x.tenantId,
      workspaceId: x.workspaceId,
      productId: "zuni",
      entitlementIds: [x.entitlementId],
      idempotencyKey: "acme:zuni-main:zuni:v1",
      requestedAt: T0,
    });
    await runtime.claimProvisioning({
      provisioningJobId: x.provisioningJobId,
      at: "2026-08-10T18:02:00.000Z",
    });
    const failed = await runtime.failProvisioning({
      provisioningJobId: x.provisioningJobId,
      errorCode: "provider_unavailable",
      at: "2026-08-10T18:03:00.000Z",
    });
    assert.equal(failed.status, "failed");

    const retried = await runtime.retryProvisioning({
      provisioningJobId: x.provisioningJobId,
      at: "2026-08-10T18:04:00.000Z",
    });
    assert.equal(retried.status, "queued");
    assert.equal(retried.attempt, 1);
    assert.equal(retried.idempotencyKey, "acme:zuni-main:zuni:v1");
  });
});
