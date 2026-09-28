import test from "node:test";
import assert from "node:assert/strict";

import { createZuniCommercialService } from "../src/zuni-commercial.mjs";

function request(overrides = {}) {
  return {
    planId: "pro",
    tenantSlug: "acme-br",
    tenantDisplayName: "ACME Brasil",
    organizationId: "component.organization.acme-br",
    ...overrides,
  };
}

test("Gateway Zuni commercial service exposes only sellable server plans", () => {
  const service = createZuniCommercialService();
  const catalog = service.listPlans();

  assert.equal(catalog.productId, "zuni");
  assert.equal(catalog.planSource, "server-catalog");
  assert.equal(catalog.automaticCharge, false);
  assert.deepEqual(catalog.plans.map(({ id }) => id), ["start", "pro", "scale"]);
  assert.equal(catalog.plans.find(({ id }) => id === "pro").pricing.monthly_cents, 59700);
});

test("Gateway Zuni activation preview resolves price and entitlements on the server", () => {
  const service = createZuniCommercialService({
    now: () => "2026-08-26T00:20:00.000Z",
  });
  const result = service.createActivationPreview(request());

  assert.equal(result.mode, "dry-run");
  assert.equal(result.planSource, "server-catalog");
  assert.equal(result.automaticCharge, false);
  assert.equal(result.productionWriteAuthorized, false);
  assert.equal(result.activationPlan.planId, "pro");
  assert.equal(result.activationPlan.subscription.currency, "BRL");
  assert.equal(result.activationPlan.subscription.monthlyAmount, 597);
  assert.equal(result.activationPlan.subscription.status, "assisted_activation");

  const values = Object.fromEntries(
    result.activationPlan.entitlements.map(({ record, value }) => [
      record.capability,
      value,
    ]),
  );
  assert.equal(values["limit-whatsapp-channels"], 2);
  assert.equal(values["limit-users"], 10);
});

test("Gateway Zuni activation preview rejects client-owned commercial snapshots", () => {
  const service = createZuniCommercialService();

  for (const field of ["plan", "pricing", "limits", "capabilities", "monthly_cents"]) {
    assert.throws(
      () => service.createActivationPreview(request({ [field]: { monthly_cents: 1 } })),
      new RegExp(`zuni_activation_input_field_not_allowed:${field}`),
    );
  }

  assert.throws(
    () => service.createActivationPreview(request({ planId: "master" })),
    /zuni_plan_not_sellable:master/,
  );
});
