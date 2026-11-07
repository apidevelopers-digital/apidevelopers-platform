import test from "node:test";
import assert from "node:assert/strict";

import {
  getZuniCommercialCatalog,
  listZuniCommercialPlans,
  requireZuniSellableCommercialPlan,
  resolveZuniCommercialPlan,
} from "../src/zuni-plan-catalog.mjs";
import { createZuniActivationPlan } from "../src/zuni-commercial-activation.mjs";

test("Zuni server catalog preserves canonical commercial values", () => {
  const catalog = getZuniCommercialCatalog();
  assert.equal(catalog.product_id, "zuni");
  assert.equal(catalog.currency, "BRL");
  assert.equal(catalog.automatic_charge, false);
  assert.deepEqual(
    Object.fromEntries(Object.entries(catalog.plans).map(([id, plan]) => [
      id,
      [plan.pricing.monthly_cents, plan.limits.whatsapp_channels ?? null, plan.limits.users ?? null, plan.sellable],
    ])),
    {
      start: [29700, 1, 3, true],
      pro: [59700, 2, 10, true],
      scale: [129000, 5, 25, true],
      master: [169000, null, null, false],
    },
  );
});

test("Zuni catalog resolves inheritance and blocks preview plans from sale", () => {
  const master = resolveZuniCommercialPlan("master");
  assert.deepEqual(master.limits, { whatsapp_channels: 5, users: 25 });
  assert.equal(master.capabilities.inbox, "included");
  assert.equal(master.capabilities.api, "governed");
  assert.equal(master.capabilities.uni_co, "integrated");
  assert.ok(Object.isFrozen(master));
  assert.ok(Object.isFrozen(master.capabilities));

  for (const id of ["start", "pro", "scale"]) {
    assert.equal(requireZuniSellableCommercialPlan(id).id, id);
  }
  assert.throws(() => requireZuniSellableCommercialPlan("master"), /zuni_plan_not_sellable:master/);
  assert.throws(() => requireZuniSellableCommercialPlan("unknown"), /zuni_plan_not_found/);
  assert.deepEqual(listZuniCommercialPlans().map(({ id }) => id), ["start", "pro", "scale"]);
});

test("Server selected plan feeds Zuni activation without enabling charge or production write", () => {
  const activation = createZuniActivationPlan({
    plan: requireZuniSellableCommercialPlan("pro"),
    tenantSlug: "acme-br",
    tenantDisplayName: "ACME Brasil",
    organizationId: "component.organization.acme-br",
    workspaceSlug: "principal",
    workspaceDisplayName: "Principal",
    createdAt: "2026-08-25T23:59:00.000Z",
  });

  assert.equal(activation.planId, "pro");
  assert.equal(activation.subscription.currency, "BRL");
  assert.equal(activation.subscription.monthlyAmount, 597);
  assert.equal(activation.subscription.status, "assisted_activation");
  assert.equal(activation.automaticCharge, false);
  assert.equal(activation.productionWriteAuthorized, false);

  const values = Object.fromEntries(
    activation.entitlements.map(({ record, value }) => [record.capability, value]),
  );
  assert.equal(values["limit-whatsapp-channels"], 2);
  assert.equal(values["limit-users"], 10);
  assert.equal(values.api, "included");
});
