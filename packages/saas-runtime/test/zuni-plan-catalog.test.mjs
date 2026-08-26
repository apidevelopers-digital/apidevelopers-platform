import test from "node:test";
import assert from "node:assert/strict";

import {
  ZUNI_COMMERCIAL_CATALOG_V1,
  getZuniCommercialCatalog,
  listZuniCommercialPlans,
  requireZuniSellableCommercialPlan,
  resolveZuniCommercialPlan,
  resolveZuniPlanEntitlements,
} from "../src/zuni-plan-catalog.mjs";
import { createZuniActivationPlan } from "../src/zuni-commercial-activation.mjs";

test("Zuni server catalog preserves the current product commercial values", () => {
  const catalog = getZuniCommercialCatalog();

  assert.equal(catalog, ZUNI_COMMERCIAL_CATALOG_V1);
  assert.equal(catalog.version, 1);
  assert.equal(catalog.product_id, "zuni");
  assert.equal(catalog.currency, "BRL");
  assert.equal(catalog.automatic_charge, false);
  assert.deepEqual(catalog.billing_cycles, ["monthly", "annual"]);

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(catalog.plans).map(([id, plan]) => [
        id,
        {
          monthly_cents: plan.pricing.monthly_cents,
          annual_total_cents: plan.pricing.annual_total_cents,
          annual_monthly_equivalent_cents: plan.pricing.annual_monthly_equivalent_cents,
          whatsapp_channels: plan.limits.whatsapp_channels ?? null,
          users: plan.limits.users ?? null,
          sellable: plan.sellable,
        },
      ]),
    ),
    {
      start: {
        monthly_cents: 29700,
        annual_total_cents: 297000,
        annual_monthly_equivalent_cents: 24750,
        whatsapp_channels: 1,
        users: 3,
        sellable: true,
      },
      pro: {
        monthly_cents: 59700,
        annual_total_cents: 597000,
        annual_monthly_equivalent_cents: 49750,
        whatsapp_channels: 2,
        users: 10,
        sellable: true,
      },
      scale: {
        monthly_cents: 129000,
        annual_total_cents: 1290000,
        annual_monthly_equivalent_cents: 107500,
        whatsapp_channels: 5,
        users: 25,
        sellable: true,
      },
      master: {
        monthly_cents: 169000,
        annual_total_cents: null,
        annual_monthly_equivalent_cents: null,
        whatsapp_channels: null,
        users: null,
        sellable: false,
      },
    },
  );
});

test("Zuni plan resolution is server-side, immutable and inheritance-aware", () => {
  const master = resolveZuniCommercialPlan(" MASTER ");
  const entitlements = resolveZuniPlanEntitlements("master");

  assert.equal(master.id, "master");
  assert.equal(master.product_id, "zuni");
  assert.equal(master.currency, "BRL");
  assert.equal(master.sellable, false);
  assert.deepEqual(master.limits, {
    whatsapp_channels: 5,
    users: 25,
  });
  assert.equal(master.capabilities.inbox, "included");
  assert.equal(master.capabilities.api, "governed");
  assert.equal(master.capabilities.webhooks, "governed");
  assert.equal(master.capabilities.uni_co, "integrated");
  assert.equal(master.capabilities.documents, "included");
  assert.equal(entitlements.plan_id, "master");

  assert.ok(Object.isFrozen(master));
  assert.ok(Object.isFrozen(master.pricing));
  assert.ok(Object.isFrozen(master.limits));
  assert.ok(Object.isFrozen(master.capabilities));
  assert.throws(() => {
    master.pricing.monthly_cents = 1;
  }, TypeError);
});

test("Only published sellable Zunican become commercial activation input", () => {
  for (const id of ["start", "pro", "scale"]) {
    const plan = requireZuniSellableCommercialPlan(id);
    assert.equal(plan.id, id);
    assert.equal(plan.sellable, true);
    assert.equal(plan.pricing_status, "published");
  }

  assert.throws(
    () => requireZuniSellableCommercialPlan("master"),
    /zuni_plan_not_sellable:master/,
   );
  assert.throws(
    () => requireZuniSellableCommercialPlan("unknown"),
    /zuni_plan_not_found/,
  );

  assert.deepEqual(
    listZuniCommercialPlans().map(({ id }) => id),
    ["start", "pro", "scale"],
  );
  assert.deepEqual(
    listZuniCommercialPlans({ includePreview: true }).map(({ id }) => id),
    ["start", "pro", "scale", "master"],
  );
});

test("Server-resolved plan feeds the existing governed activation plan contract", () => {
  const plan = requireZuniSellableCommercialPlan("pro");
  const activation = createZuniActivationPlan( {
    plan,
    tenantSlug: "acme-br",
    tenantDisplayName: "ACME Brasil",
    organizationId: "component.organization.acme-br",
    workspaceSlug: "principal",
    workspaceDisplayName: "Principal",
    createdAt: "2026-08-25T23:59:00.000Z",
  });

  assert.equal(activation.productId, "zuni");
  assert.equal(activation.planId, "pro");
  assert.equal(activation.subscription.currency, "BRL");
  assert.equal(activation.subscription.monthlyAmount, 597);
  assert.equal(activation.subscription.status, "assisted_activation");
  assert.equal(activation.automaticCharge, false);
  assert.equal(activation.productionWriteAuthorized, false);

  const byCapability = new Map(
    activation.entitlements.map(({ record, value, kind }) => [
      record.capability,
      { value, kind },
    ]),
  );
  assert.deepEqual(byCapability.get("limit-whatsapp-channels"), {
    value: 2,
    kind: "limit",
  });
  assert.deepEqual(byCapability.get("limit-users"), {
    value: 10,
    kind: "limit",
  });
  assert.deepEqual(byCapability.get("api"), {
    value: "included",
    kind: "feature",
  });
});
