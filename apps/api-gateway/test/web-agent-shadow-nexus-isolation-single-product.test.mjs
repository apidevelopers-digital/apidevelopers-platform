import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createSaasAccessComposition } from "../src/saas-access-composition.mjs";

const T0 = "2026-08-15T18:00:00.000Z";
const T1 = "2026-08-15T18:01:00.000Z";
const T2 = "2026-08-15T18:02:00.000Z";

const tenant = Object.freeze({
  tenantId: "component.tenant.web-agent-isolation-single",
  organizationId: "component.organization.web-agent-isolation-single",
  principalId: "user:web-agent-isolation-single",
});

const products = Object.freeze({
  uni: Object.freeze({
    workspaceId: "component.workspace.web-agent-isolation-single.uni-co",
    productId: "product:uni-co",
    subscriptionId: "component.subscription.web-agent-isolation-single.uni-co",
    entitlementId: "component.entitlement.web-agent-isolation-single.uni-co.chat",
    provisioningJobId: "component.provisioning.web-agent-isolation-single.uni-co",
    accessGrantId: "component.access.web-agent-isolation-single.uni-co.user",
    slug: "uni-co",
  }),
  nexus: Object.freeze({
    workspaceId: "component.workspace.web-agent-isolation-single.nexus",
    productId: "product:nexus",
    subscriptionId: "component.subscription.web-agent-isolation-single.nexus",
    entitlementId: "component.entitlement.web-agent-isolation-single.nexus.chat",
    provisioningJobId: "component.provisioning.web-agent-isolation-single.nexus",
    accessGrantId: "component.access.web-agent-isolation-single.nexus.user",
    slug: "nexus",
  }),
});

async function composition(t) {
  const dir = await mkdtemp(join(tmpdir(), "apd-web-agent-isolation-single-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createJsonFileStore({
    filePath: join(dir, "state.json"),
    fsync: false,
    clock: () => T0,
  });
  return createSaasAccessComposition({ store, clock: () => T0 });
}

async function seed({ saasRuntime, saasAccess, p }) {
  await saasRuntime.registerTenantWorkspace({
    tenant: {
      tenantId: tenant.tenantId,
      organizationId: tenant.organizationId,
      slug: "web-agent-isolation-single",
      displayName: "Web Agent Isolation Single",
      status: "active",
      createdAt: T0,
    },
    workspace: {
      workspaceId: p.workspaceId,
      tenantId: tenant.tenantId,
      productId: p.productId,
      slug: p.slug,
      displayName: p.slug,
      status: "active",
      createdAt: T0,
    },
  });

  await saasRuntime.startSubscription({
    subscriptionId: p.subscriptionId,
    tenantId: tenant.tenantId,
    productId: p.productId,
    planId: "shadow-e2e",
    status: "assisted_activation",
    currency: "BRL",
    monthlyAmount: 0,
    createdAt: T0,
  });
  await saasRuntime.activateSubscription({ subscriptionId: p.subscriptionId, activatedAt: T1 });

  await saasRuntime.grantEntitlement({
    entitlementId: p.entitlementId,
    subscriptionId: p.subscriptionId,
    tenantId: tenant.tenantId,
    workspaceId: p.workspaceId,
    productId: p.productId,
    capability: "web-agent",
    status: "active",
    sourcePlanId: "shadow-e2e",
    createdAt: T0,
  });

  await saasRuntime.enqueueProvisioning({
    provisioningJobId: p.provisioningJobId,
    subscriptionId: p.subscriptionId,
    tenantId: tenant.tenantId,
    workspaceId: p.workspaceId,
    productId: p.productId,
    entitlementIds: [p.entitlementId],
    idempotencyKey: `web-agent-isolation-single:${p.slug}:v1`,
    requestedAt: T0,
  });
  await saasRuntime.claimProvisioning({ provisioningJobId: p.provisioningJobId, at: T1 });
  await saasRuntime.completeProvisioning({
    provisioningJobId: p.provisioningJobId,
    result: { productReady: true },
    at: T2,
  });

  await saasAccess.grantAccess({
    accessGrantId: p.accessGrantId,
    principalId: tenant.principalId,
    tenantId: tenant.tenantId,
    workspaceId: p.workspaceId,
    productId: p.productId,
    subscriptionId: p.subscriptionId,
    entitlementId: p.entitlementId,
    requiredScopes: ["web:chat"],
    status: "pending",
    createdAt: T0,
  });
  await saasAccess.activateAccess({
    accessGrantId: p.accessGrantId,
    provisioningJobId: p.provisioningJobId,
    at: T2,
  });
}

function identity() {
  return Object.freeze({
    principal: Object.freeze({
      id: tenant.principalId,
      tenantId: tenant.tenantId,
      status: "active",
      scopes: Object.freeze(["web:chat"]),
    }),
  });
}

async function assertAllowed({ saasAccess, p }) {
  const result = await saasAccess.evaluateAccess({
    identity: identity(),
    accessGrantId: p.accessGrantId,
    tenantId: tenant.tenantId,
    workspaceId: p.workspaceId,
    productId: p.productId,
  });
  assert.equal(result.allowed, true);
}

test("uni-only lifecycle", async (t) => {
  const { saasRuntime, saasAccess } = await composition(t);
  await seed({ saasRuntime, saasAccess, p: products.uni });
  await assertAllowed({ saasAccess, p: products.uni });
});

test("nexus-only lifecycle", async (t) => {
  const { saasRuntime, saasAccess } = await composition(t);
  await seed({ saasRuntime, saasAccess, p: products.nexus });
  await assertAllowed({ saasAccess, p: products.nexus });
});

test("dual-product lifecycle", async (t) => {
  const { saasRuntime, saasAccess } = await composition(t);
  await seed({ saasRuntime, saasAccess, p: products.uni });
  await seed({ saasRuntime, saasAccess, p: products.nexus });

  await assertAllowed({ saasAccess, p: products.uni });
  await assertAllowed({ saasAccess, p: products.nexus });

  const crossUniToNexus = await saasAccess.evaluateAccess({
    identity: identity(),
    accessGrantId: products.uni.accessGrantId,
    tenantId: tenant.tenantId,
    workspaceId: products.nexus.workspaceId,
    productId: products.nexus.productId,
  });
  assert.deepEqual(
    { allowed: crossUniToNexus.allowed, reason: crossUniToNexus.reason },
    { allowed: false, reason: "access_context_mismatch" },
  );

  const crossNexusToUni = await saasAccess.evaluateAccess({
    identity: identity(),
    accessGrantId: products.nexus.accessGrantId,
    tenantId: tenant.tenantId,
    workspaceId: products.uni.workspaceId,
    productId: products.uni.productId,
  });
  assert.deepEqual(
    { allowed: crossNexusToUni.allowed, reason: crossNexusToUni.reason },
    { allowed: false, reason: "access_context_mismatch" },
  );
});
