import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createJsonFileStore } from "../../persistence-core/src/index.mjs";
import { createSaasRuntime, createAccessRuntime } from "../src/index.mjs";

const T0 = "2026-08-10T18:00:00.000Z";
const T3 = "2026-08-10T18:03:00.000Z";
const T4 = "2026-08-10T18:04:00.000Z";

const ids = {
  tenant: "component.tenant.acme",
  org: "component.organization.acme",
  workspace: "component.workspace.acme.zuni-main",
  subscription: "component.subscription.acme.zuni",
  entitlement: "component.entitlement.acme.zuni-main.templates",
  job: "component.provisioning.acme.zuni-main.zuni",
  grant: "component.access.acme.zuni-main.zuni.user-1",
};

async function fixture(work) {
  const dir = await mkdtemp(join(tmpdir(), "apd-saas-access-"));
  const store = createJsonFileStore({
    filePath: join(dir, "state.json"),
    fsync: false,
    clock: () => T0,
  });
  const saas = createSaasRuntime({ store, clock: () => T0 });
  const access = createAccessRuntime({ store, saasRuntime: saas, clock: () => T0 });
  try {
    return await work({ saas, access });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seed(saas) {
  await saas.registerTenantWorkspace({
    tenant: {
      tenantId: ids.tenant,
      organizationId: ids.org,
      slug: "acme",
      displayName: "Acme",
      status: "active",
      createdAt: T0,
    },
    workspace: {
      workspaceId: ids.workspace,
      tenantId: ids.tenant,
      productId: "zuni",
      slug: "zuni-main",
      displayName: "Zuni Main",
      status: "active",
      createdAt: T0,
    },
  });

  await saas.startSubscription({
    subscriptionId: ids.subscription,
    tenantId: ids.tenant,
    productId: "zuni",
    planId: "pro",
    status: "assisted_activation",
    currency: "BRL",
    monthlyAmount: 597,
    createdAt: T0,
  });
  await saas.activateSubscription({ subscriptionId: ids.subscription, activatedAt: T3 });

  await saas.grantEntitlement({
    entitlementId: ids.entitlement,
    subscriptionId: ids.subscription,
    tenantId: ids.tenant,
    workspaceId: ids.workspace,
    productId: "zuni",
    capability: "templates",
    status: "active",
    sourcePlanId: "pro",
    createdAt: T0,
  });

  await saas.enqueueProvisioning({
    provisioningJobId: ids.job,
    subscriptionId: ids.subscription,
    tenantId: ids.tenant,
    workspaceId: ids.workspace,
    productId: "zuni",
    entitlementIds: [ids.entitlement],
    idempotencyKey: "acme:zuni-main:zuni:v1",
    requestedAt: T0,
  });
}

test("access remains fail-closed until provisioning succeeds", async () => {
  await fixture(async ({ saas, access }) => {
    await seed(saas);

    await access.grantAccess({
      accessGrantId: ids.grant,
      principalId: "user-1",
      tenantId: ids.tenant,
      workspaceId: ids.workspace,
      productId: "zuni",
      subscriptionId: ids.subscription,
      entitlementId: ids.entitlement,
      requiredScopes: ["zuni:use"],
      status: "pending",
      createdAt: T0,
    });

    await assert.rejects(
      () => access.activateAccess({
        accessGrantId: ids.grant,
        provisioningJobId: ids.job,
        at: T3,
      }),
      /succeeded provisioning/,
    );

    await saas.claimProvisioning({ provisioningJobId: ids.job, at: T3 });
    await saas.completeProvisioning({
      provisioningJobId: ids.job,
      result: { productReady: true },
      at: T4,
    });

    const active = await access.activateAccess({
      accessGrantId: ids.grant,
      provisioningJobId: ids.job,
      at: T4,
    });
    assert.equal(active.status, "active");

    const denied = await access.evaluateAccess({
      identity: { role: "client", principal: { scopes: [] } },
      accessGrantId: ids.grant,
      tenantId: ids.tenant,
      workspaceId: ids.workspace,
      productId: "zuni",
    });
    assert.equal(denied.allowed, false);
    assert.deepEqual(denied.missingScopes, ["zuni:use"]);

    const allowed = await access.evaluateAccess({
      identity: { role: "client", principal: { scopes: ["zuni:use"] } },
      accessGrantId: ids.grant,
      tenantId: ids.tenant,
      workspaceId: ids.workspace,
      productId: "zuni",
    });
    assert.equal(allowed.allowed, true);
  });
});

test("onboarding is persisted per tenant workspace product", async () => {
  await fixture(async ({ access }) => {
    const record = await access.setOnboarding({
      tenantId: ids.tenant,
      workspaceId: ids.workspace,
      productId: "zuni",
      status: "ready",
      requiredSteps: ["profile", "channel"],
      completedSteps: ["profile"],
      updatedAt: T3,
    });
    assert.equal(record.status, "ready");

    const reloaded = await access.getOnboarding(ids.tenant, ids.workspace, "zuni");
    assert.deepEqual(reloaded.completedSteps, ["profile"]);
  });
});
