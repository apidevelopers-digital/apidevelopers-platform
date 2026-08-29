import assert from "node:assert/strict";
import test from "node:test";

import { createProviderPlanRegistry } from "../src/provider-plan-registry.mjs";

test("provider plan registry resolves an active external plan by price and environment", () => {
  const registry = createProviderPlanRegistry([{
    priceId: "universo.start.month.br",
    provider: "mercadopago",
    environment: "test",
    providerPlanId: "plan_test_1",
    checkoutUrl: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=plan_test_1",
    status: "active",
  }]);

  const binding = registry.resolve({
    priceId: "universo.start.month.br",
    provider: "mercadopago",
    environment: "test",
  });

  assert.equal(binding.providerPlanId, "plan_test_1");
  assert.match(binding.checkoutUrl, /preapproval_plan_id=plan_test_1/);
});

test("provider plan registry fails closed for missing, disabled, duplicate or non-https bindings", () => {
  const disabled = createProviderPlanRegistry([{
    priceId: "universo.start.month.br",
    provider: "mercadopago",
    environment: "test",
    providerPlanId: "plan_test_1",
    checkoutUrl: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=plan_test_1",
    status: "disabled",
  }]);

  assert.throws(
    () => disabled.resolve({
      priceId: "universo.start.month.br",
      provider: "mercadopago",
      environment: "test",
    }),
    /provider_plan_binding_not_found/,
  );

  assert.throws(() => createProviderPlanRegistry([
    {
      priceId: "x",
      provider: "mercadopago",
      environment: "test",
      providerPlanId: "one",
      checkoutUrl: "https://example.test/one",
    },
    {
      priceId: "x",
      provider: "mercadopago",
      environment: "test",
      providerPlanId: "two",
      checkoutUrl: "https://example.test/two",
    },
  ]), /duplicate provider plan binding/);

  assert.throws(() => createProviderPlanRegistry([{
    priceId: "x",
    provider: "mercadopago",
    environment: "test",
    providerPlanId: "one",
    checkoutUrl: "http://example.test/one",
  }]), /checkoutUrl must use https/);
});
