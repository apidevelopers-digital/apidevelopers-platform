import assert from "node:assert/strict";
import test from "node:test";

import {
  BR_PUBLISHED_SAAS_TEST_CATALOG,
  BR_PUBLISHED_SAAS_TEST_PRICES,
  BR_PUBLISHED_SAAS_TEST_PRODUCTS,
} from "../catalogs/br-published-saas-test.mjs";
import {
  BR_MAIN_TEST_BINDINGS,
  BR_MAIN_TEST_FINANCIAL_CONTROL,
  BR_MAIN_TEST_LEGAL_ENTITY_ID,
  BR_MAIN_TEST_MERCHANT_ACCOUNT_ID,
  BR_MAIN_TEST_WEBHOOK_PATH,
} from "../bindings/br-main-test.mjs";

test("published SaaS test catalog contains exactly the five approved products", () => {
  const products = [...new Set(BR_PUBLISHED_SAAS_TEST_PRICES.map((price) => price.productId))].sort();
  assert.deepEqual(products, [...BR_PUBLISHED_SAAS_TEST_PRODUCTS].sort());
  assert.equal(BR_PUBLISHED_SAAS_TEST_PRICES.length, 27);
  assert.equal(BR_PUBLISHED_SAAS_TEST_PRICES.every((price) => price.active), true);
});

test("uni products expose monthly and annual test prices while Zuni exposes public monthly plans only", () => {
  for (const productId of ["uni.co", "imuni", "uni.juri", "uni.verso"]) {
    const prices = BR_PUBLISHED_SAAS_TEST_PRICES.filter((price) => price.productId === productId);
    assert.equal(prices.length, 6);
    assert.equal(prices.filter((price) => price.interval === "month").length, 3);
    assert.equal(prices.filter((price) => price.interval === "year").length, 3);
  }

  const zuni = BR_PUBLISHED_SAAS_TEST_PRICES.filter((price) => price.productId === "zuni");
  assert.deepEqual(zuni.map((price) => price.planId).sort(), ["pro", "scale", "start"]);
  assert.equal(zuni.every((price) => price.interval === "month"), true);
  assert.throws(() => BR_PUBLISHED_SAAS_TEST_CATALOG.get("zuni.master.month.br"), /not found or inactive/);
});

test("all five products resolve to the same Brazilian Mercado Pago test merchant", () => {
  for (const productId of BR_PUBLISHED_SAAS_TEST_PRODUCTS) {
    const resolved = BR_MAIN_TEST_FINANCIAL_CONTROL.resolve({
      productId,
      countryCode: "BR",
      currency: "BRL",
      environment: "test",
    });
    assert.equal(resolved.legalEntity.legalEntityId, BR_MAIN_TEST_LEGAL_ENTITY_ID);
    assert.equal(resolved.merchantAccount.merchantAccountId, BR_MAIN_TEST_MERCHANT_ACCOUNT_ID);
    assert.equal(resolved.merchantAccount.provider, "mercadopago");
    assert.equal(resolved.merchantAccount.environment, "test");
  }
});

test("business-unit accounting dimensions remain separated under one CNPJ", () => {
  const byProduct = Object.fromEntries(BR_MAIN_TEST_BINDINGS.map((binding) => [binding.productId, binding.businessUnitId]));
  assert.equal(byProduct["uni.co"], "apd");
  assert.equal(byProduct.zuni, "apd");
  assert.equal(byProduct.imuni, "uni");
  assert.equal(byProduct["uni.juri"], "uni");
  assert.equal(byProduct["uni.verso"], "uni");
});

test("the five products share one merchant-scoped webhook", () => {
  assert.equal(BR_MAIN_TEST_WEBHOOK_PATH, "/v1/financial/webhooks/mercadopago/br-main");
});
