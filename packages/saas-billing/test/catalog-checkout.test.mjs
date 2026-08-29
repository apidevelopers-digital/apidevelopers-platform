import test from "node:test";
import assert from "node:assert/strict";
import { createBillingCatalog, createBillingPrice } from "../src/index.mjs";
import { withBilling, seedPending } from "./helpers.mjs";

test("catalog keeps charge amounts in minor units and normalizes currency", () => {
  const catalog = createBillingCatalog([{
    priceId:"UniCo-Pro-BRL-Month", productId:"UNIco", planId:"PRO",
    currency:"brl", interval:"month", amountMinor:59725,
  }]);
  const price = catalog.get("unico-pro-brl-month");
  assert.equal(price.currency, "BRL");
  assert.equal(price.amountMinor, 59725);
  assert.equal(price.productId, "unico");
  assert.equal(price.planId, "pro");
});

test("draft prices may be zero only while inactive", () => {
  const draft = createBillingPrice({
    priceId:"unisocial.start.month.br",
    productId:"uni.social",
    planId:"start",
    currency:"BRL",
    interval:"month",
    amountMinor:0,
    active:false,
  });
  assert.equal(draft.amountMinor, 0);
  assert.equal(draft.active, false);

  assert.throws(
    () => createBillingPrice({
      priceId:"unisocial.start.month.br",
      productId:"uni.social",
      planId:"start",
      currency:"BRL",
      interval:"month",
      amountMinor:0,
      active:true,
    }),
    /amountMinor must be greater than zero/,
  );
});

test("checkout resolves amount server-side and is idempotent by intent", async () => {
  await withBilling(async ({ saasRuntime, billing, calls }) => {
    const x = await seedPending(saasRuntime);
    const input = {
      checkoutIntentId:"checkout-intent-1", tenantId:x.tenantId, workspaceId:x.workspaceId,
      subscriptionId:x.subscriptionId, priceId:"unico-pro-brl-month",
      successUrl:"https://unico.apidevelopers.digital/billing/success",
      cancelUrl:"https://unico.apidevelopers.digital/billing/cancel",
    };
    const checkout = await billing.createCheckout(input);
    assert.equal(checkout.amountMinor, 59700);
    assert.equal(checkout.providerMode, "test");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].price.amountMinor, 59700);
    const repeated = await billing.createCheckout(input);
    assert.equal(repeated.providerCheckoutId, checkout.providerCheckoutId);
    assert.equal(calls.length, 1);
  });
});
