import assert from "node:assert/strict";
import test from "node:test";

import {
  BR_MERCADOPAGO_TEST_PILOT_PRICE_ID,
  BR_MERCADOPAGO_TEST_PLAN_ROLLOUT_DRY_RUN,
  createMercadoPagoTestPlanRolloutDryRun,
} from "../rollouts/br-mercadopago-test-plan-rollout.mjs";

test("Mercado Pago rollout dry-run covers all 27 active published prices and writes nothing", () => {
  const rollout = BR_MERCADOPAGO_TEST_PLAN_ROLLOUT_DRY_RUN;

  assert.equal(rollout.provider, "mercadopago");
  assert.equal(rollout.environment, "test");
  assert.equal(rollout.writesEnabled, false);
  assert.equal(rollout.liveEnabled, false);
  assert.equal(rollout.publicCheckoutEnabled, false);
  assert.equal(rollout.activeCatalogPriceCount, 27);
  assert.equal(rollout.productCount, 5);
  assert.equal(rollout.existingExternalPlanCount, 1);
  assert.equal(rollout.createRequiredCount, 26);
  assert.deepEqual(rollout.excludedDraftProducts, ["uni.social"]);
});

test("rollout keeps the confirmed uni.verso pilot separate and produces safe create payloads for the rest", () => {
  const rollout = BR_MERCADOPAGO_TEST_PLAN_ROLLOUT_DRY_RUN;
  const pilot = rollout.items.find((item) => item.priceId === BR_MERCADOPAGO_TEST_PILOT_PRICE_ID);
  assert.equal(pilot.state, "external_created_unbound");
  assert.equal(pilot.providerPlanId, null);
  assert.equal(pilot.checkoutUrl, null);

  const annual = rollout.items.find((item) => item.priceId === "imuni.pro.year.br");
  assert.equal(annual.state, "create_required");
  assert.deepEqual(annual.createPayload.auto_recurring, {
    frequency: 12,
    frequency_type: "months",
    transaction_amount: 1690,
    currency_id: "BRL",
  });
  assert.equal(annual.createPayload.back_url, "https://sitedauni.com/apps/imuni/");
});

test("rollout rejects an alleged existing external plan that is not in the active catalog", () => {
  assert.throws(
    () => createMercadoPagoTestPlanRolloutDryRun({ existingPriceIds: ["unisocial.start.month.br"] }),
    /unknown published test price/,
  );
});
