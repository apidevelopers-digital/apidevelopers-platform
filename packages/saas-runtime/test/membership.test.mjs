import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createJsonFileStore } from "../../persistence-core/src/index.mjs";
import {
  createSaasRuntime,
  createAccessRuntime,
  createMembershipRuntime,
} from "../src/index.mjs";

const T0 = "2026-08-21T05:00:00.000Z";
const T1 = "2026-08-21T05:01:00.000Z";
const T2 = "2026-08-21T05:02:00.000Z";
const PRINCIPAL_ID = "principal-1";
const USER_ID = "component.user.principal-1";
const PRODUCT_ID = "uni.co";

function ids(slug) {
  return Object.freeze({
    tenant: `component.tenant.${slug}`,
    org: `component.organization.${slug}`,
    workspace: `component.workspace.${slug}.uni-main`,
    subscription: `component.subscription.${slug}.uni`,
    entitlement: `component.entitlement.${slug}.uni-main.chat`,
    job: `component.provisioning.${slug}.uni-main.uni`,
    grant: `component.access.${slug}.uni-main.unico.${PRINCIPAL_ID}`,
    role: `component.role.${slug}.uni-main.member`,
    membership: `component.membership.${slug}.uni-main.${PRINCIPAL_ID}`,
    chat: `component.chat-session.${slug}.uni-main.chat-1`,
  });
}

async function fixture(work) {
  const dir = await mkdtemp(join(tmpdir(), "apd-saas-membership-"));
  const store = createJsonFileStore({
    filePath: join(dir, "state.json"),
    fsync: false,
    clock: () => T0,
  });
  const saas = createSaasRuntime({ store, clock: () => T0 });
  const access = createAccessRuntime({ store, saasRuntime: saas, clock: () => T0 });
  const membership = createMembershipRuntime({
    store,
    saasRuntime: saas,
    accessRuntime: access,
    clock: () => T0,
  });

  try {
    return await work({ saas, access, membership });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedTenant({ slug, saas, access }) {
  const ref = ids(slug);

  await saas.registerTenantWorkspace({
    tenant: {
      tenantId: ref.tenant,
      organizationId: ref.org,
      slug,
      displayName: slug.toUpperCase(),
      status: "active",
      createdAt: T0,
    },
    workspace: {
      workspaceId: ref.workspace,
      tenantId: ref.tenant,
      productId: PRODUCT_ID,
      slug: "uni-main",
      displayName: "uni.co",
      status: "active",
      createdAt: T0,
    },
  });

  await saas.startSubscription({
    subscriptionId: ref.subscription,
    tenantId: ref.tenant,
    productId: PRODUCT_ID,
    planId: "core",
    status: "assisted_activation",
    currency: "BRL",
    monthlyAmount: 0,
    createdAt: T0,
  });
  await saas.activateSubscription({
    subscriptionId: ref.subscription,
    activatedAt: T1,
  });

  await saas.grantEntitlement({
    entitlementId: ref.entitlement,
    subscriptionId: ref.subscription,
    tenantId: ref.tenant,
    workspaceId: ref.workspace,
    productId: PRODUCT_ID,
    capability: "chat",
    status: "active",
    sourcePlanId: "core",
    createdAt: T0,
  });

  await saas.enqueueProvisioning({
    provisioningJobId: ref.job,
    subscriptionId: ref.subscription,
    tenantId: ref.tenant,
    workspaceId: ref.workspace,
    productId: PRODUCT_ID,
    entitlementIds: [ref.entitlement],
    idempotencyKey: `${slug}:uni-main:uni:v1`,
    requestedAt: T0,
  });
  await saas.claimProvisioning({ provisioningJobId: ref.job, at: T1 });
  await saas.completeProvisioning({
    provisioningJobId: ref.job,
    result: { productReady: true },
    at: T2,
  });

  await access.grantAccess({
    accessGrantId: ref.grant,
    principalId: PRINCIPAL_ID,
    tenantId: ref.tenant,
    workspaceId: ref.workspace,
    productId: PRODUCT_ID,
    subscriptionId: ref.subscription,
    entitlementId: ref.entitlement,
    requiredScopes: ["chat:use"],
    grantedScopes: ["chat:use"],
    status: "pending",
    createdAt: T0,
  });
  await access.activateAccess({
    accessGrantId: ref.grant,
    provisioningJobId: ref.job,
    at: T2,
  });

  return ref;
}

test("SaaS Core opens chat only for coherent membership, role, grant and tenant boundary", async () => {
  await fixture(async ({ saas, access, membership }) => {
    const acme = await seedTenant({ slug: "acme", saas, access });
    const beta = await seedTenant({ slug: "beta", saas, access });

    await membership.registerUser({
      userId: USER_ID,
      principalId: PRINCIPAL_ID,
      status: "active",
      createdAt: T0,
    });

    await membership.registerRole({
      roleId: acme.role,
      tenantId: acme.tenant,
      workspaceId: acme.workspace,
      scope: "workspace",
      key: "member",
      permissions: ["chat:use"],
      status: "active",
      createdAt: T0,
    });

    await membership.addMembership({
      membershipId: acme.membership,
      tenantId: acme.tenant,
      workspaceId: acme.workspace,
      userId: USER_ID,
      principalId: PRINCIPAL_ID,
      roleId: acme.role,
      status: "active",
      createdAt: T0,
    });

    const identity = {
      role: "client",
      principal: {
        id: PRINCIPAL_ID,
        scopes: ["chat:use"],
      },
    };

    const allowed = await membership.openChatSession({
      identity,
      chatSessionId: acme.chat,
      tenantId: acme.tenant,
      workspaceId: acme.workspace,
      accessGrantId: acme.grant,
      productId: PRODUCT_ID,
      locale: "pt-BR",
      createdAt: T2,
    });

    assert.equal(allowed.opened, true);
    assert.equal(allowed.reason, null);
    assert.equal(allowed.session.tenantId, acme.tenant);
    assert.equal(allowed.session.workspaceId, acme.workspace);
    assert.equal(allowed.session.principalId, PRINCIPAL_ID);
    assert.equal(allowed.session.userId, USER_ID);
    assert.equal(allowed.session.membershipId, acme.membership);
    assert.equal(allowed.session.roleId, acme.role);
    assert.equal(allowed.session.accessGrantId, acme.grant);
    assert.equal(allowed.session.productId, PRODUCT_ID);
    assert.equal(allowed.session.locale, "pt-BR");

    const mismatchedGrant = await membership.openChatSession({
      identity,
      chatSessionId: "component.chat-session.acme.uni-main.chat-2",
      tenantId: acme.tenant,
      workspaceId: acme.workspace,
      accessGrantId: beta.grant,
      productId: PRODUCT_ID,
      locale: "pt-BR",
      createdAt: T2,
    });

    assert.equal(mismatchedGrant.opened, false);
    assert.equal(mismatchedGrant.reason, "membership_authority_mismatch");

    const noBetaMembership = await membership.openChatSession({
      identity,
      chatSessionId: beta.chat,
      tenantId: beta.tenant,
      workspaceId: beta.workspace,
      accessGrantId: beta.grant,
      productId: PRODUCT_ID,
      locale: "en-US",
      createdAt: T2,
    });

    assert.equal(noBetaMembership.opened, false);
    assert.equal(noBetaMembership.reason, "membership_not_found");
  });
});
