import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSubscriptionEntitlementBinding,
  createEntitlement,
  createEntitlementId,
  createSubscription,
  createSubscriptionId,
  saasCommercialContractVersion,
} from "../src/saas-commercial.mjs";
import {
  createTenantId,
  createWorkspaceId,
} from "../src/saas-tenancy.mjs";

const createdAt = "2026-08-10T00:00:00.000Z";

function zuniSubscription(overrides = {}) {
  const tenantId = createTenantId("acme");
  return createSubscription({
    subscriptionId: createSubscriptionId("acme", "zuni"),
    tenantId,
    productId: "zuni",
    planId: "pro",
    status: "assisted_activation",
    currency: "BRL",
    monthlyAmount: 597,
    createdAt,
    ...overrides,
  });
}

test("creates a Zuni assisted subscription without claiming automatic billing", () => {
  const subscription = zuniSubscription();

  assert.equal(subscription.schemaVersion, saasCommercialContractVersion);
  assert.equal(subscription.productId, "zuni");
  assert.equal(subscription.planId, "pro");
  assert.equal(subscription.status, "assisted_activation");
  assert.equal(subscription.currency, "BRL");
  assert.equal(subscription.monthlyAmount, 597);
  assert.equal(subscription.activatedAt, null);
});

test("active subscription requires explicit activation evidence", () => {
  assert.throws(
    () => zuniSubscription({ status: "active" }),
    /active subscription requires activatedAt/,
  );

  const subscription = zuniSubscription({
    status: "active",
    activatedAt: "2026-08-10T10:00:00.000Z",
  });
  assert.equal(subscription.status, "active");
});

test("entitlement is bound to subscription, tenant, product and source plan", () => {
  const subscription = zuniSubscription();
  const entitlement = createEntitlement({
    entitlementId: createEntitlementId("acme", "zuni-main", "templates"),
    subscriptionId: subscription.subscriptionId,
    tenantId: subscription.tenantId,
    workspaceId: createWorkspaceId("acme", "zuni-main"),
    productId: "zuni",
    capability: "templates",
    status: "pending",
    sourcePlanId: "pro",
    createdAt,
  });

  assert.equal(
    assertSubscriptionEntitlementBinding(subscription, entitlement),
    true,
  );
});

test("blocks cross-tenant entitlement binding", () => {
  const subscription = zuniSubscription();
  const entitlement = createEntitlement({
    entitlementId: createEntitlementId("other", "zuni-main", "templates"),
    subscriptionId: subscription.subscriptionId,
    tenantId: createTenantId("other"),
    workspaceId: createWorkspaceId("other", "zuni-main"),
    productId: "zuni",
    capability: "templates",
    status: "pending",
    sourcePlanId: "pro",
    createdAt,
  });

  assert.throws(
    () => assertSubscriptionEntitlementBinding(subscription, entitlement),
    /tenant boundary mismatch/,
  );
});
