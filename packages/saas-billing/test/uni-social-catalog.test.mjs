import assert from "node:assert/strict";
import test from "node:test";

import {
  BR_MAIN_DRAFT_CATALOG,
  BR_MAIN_DRAFT_PRICES,
} from "../catalogs/br-main-draft.mjs";
import {
  BR_PUBLISHED_SAAS_TEST_CATALOG,
  BR_PUBLISHED_SAAS_TEST_PRICES,
} from "../catalogs/br-published-saas-test.mjs";
import {
  BR_MAIN_TEST_FINANCIAL_CONTROL,
  BR_MAIN_TEST_MERCHANT_ACCOUNT_ID,
} from "../bindings/br-main-test.mjs";

test("uni.social is anchored in the BR draft catalog without approved pricing", () => {
  const prices = BR_MAIN_DRAFT_PRICES.filter((price) => price.productId === "uni.social");
  assert.equal(prices.length, 6);
  assert.deepEqual([...new Set(prices.map((price) => price.planId))].sort(), ["pro", "scale", "start"]);
  assert.equal(prices.filter((price) => price.interval === "month").length, 3);
  assert.equal(prices.filter((price) => price.interval === "year").length, 3);
  assert.equal(prices.every((price) => price.currency === "BRL"), true);
  assert.equal(prices.every((price) => price.amountMinor === 0), true);
  assert.equal(prices.every((price) => price.active === false), true);

  assert.throws(
    () => BR_MAIN_DRAFT_CATALOG.get("unisocial.start.month.br"),
    /not found or inactive/,
  );
});

test("uni.social remains outside the published active test price catalog until pricing approval", () => {
  assert.equal(BR_PUBLISHED_SAAS_TEST_PRICES.some((price) => price.productId === "uni.social"), false);
  assert.throws(
    () => BR_PUBLISHED_SAAS_TEST_CATALOG.get("unisocial.start.month.br"),
    /not found or inactive/,
  );
});

test("uni.social already resolves to the shared Brazilian Mercado Pago test merchant", () => {
  const resolved = BR_MAIN_TEST_FINANCIAL_CONTROL.resolve({
    productId: "uni.social",
    countryCode: "BR",
    currency: "BRL",
    environment: "test",
  });

  assert.equal(resolved.merchantAccount.merchantAccountId, BR_MAIN_TEST_MERCHANT_ACCOUNT_ID);
  assert.equal(resolved.merchantAccount.provider, "mercadopago");
  assert.equal(resolved.merchantAccount.environment, "test");
  assert.equal(resolved.binding.businessUnitId, "uni");
  assert.equal(resolved.binding.brandId, "uni.social");
});
