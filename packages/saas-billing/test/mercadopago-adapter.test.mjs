import assert from "node:assert/strict";
import test from "node:test";

import { createMercadoPagoSubscriptionProvider } from "../src/providers/mercadopago.mjs";

function fixture() {
  const calls = [];
  return {
    calls,
    async createSubscriptionPlan(payload, options) {
      calls.push({ payload, options });
      return {
        id: "plan_fixture",
        init_point: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=plan_fixture",
      };
    },
    async verifyAndParseWebhook() {
      return {
        id: "evt_mp_1",
        status: "approved",
        external_reference: "subscription:acme:unico",
        occurredAt: "2026-08-11T06:00:00.000Z",
        preapprovalId: "preapproval_1",
        payerId: "payer_1",
      };
    },
  };
}

test("Mercado Pago provider creates monthly subscription plan and returns init_point", async () => {
  const client = fixture();
  const provider = createMercadoPagoSubscriptionProvider({ client, mode: "test", allowPlanCreationOnCheckout: true });
  const result = await provider.createCheckoutSession({
    checkoutIntentId: "intent_month",
    tenantId: "tenant:acme",
    workspaceId: "workspace:acme:unico",
    subscriptionId: "subscription:acme:unico",
    successUrl: "https://unico.apidevelopers.digital/billing/success",
    price: {
      productId: "unico",
      planId: "pro",
      priceId: "unico-pro-brl-month",
      interval: "month",
      amountMinor: 12345,
      currency: "BRL",
    },
  });
  assert.equal(provider.name, "mercadopago");
  assert.equal(result.providerCheckoutId, "plan_fixture");
  assert.match(result.checkoutUrl, /mercadopago/);
  assert.equal(client.calls[0].payload.auto_recurring.frequency, 1);
  assert.equal(client.calls[0].payload.auto_recurring.frequency_type, "months");
  assert.equal(client.calls[0].payload.auto_recurring.transaction_amount, 123.45);
  assert.equal(client.calls[0].payload.external_reference, "subscription:acme:unico");
  assert.equal(client.calls[0].options.idempotencyKey, "intent_month");
});

test("Mercado Pago annual interval is charged every 12 months", async () => {
  const client = fixture();
  const provider = createMercadoPagoSubscriptionProvider({ client, mode: "test", allowPlanCreationOnCheckout: true });
  await provider.createCheckoutSession({
    checkoutIntentId: "intent_year",
    tenantId: "tenant:acme",
    workspaceId: "workspace:acme:unico",
    subscriptionId: "subscription:acme:unico",
    successUrl: "https://unico.apidevelopers.digital/billing/success",
    price: {
      productId: "unico",
      planId: "pro",
      priceId: "unico-pro-brl-year",
      interval: "year",
      amountMinor: 120000,
      currency: "BRL",
    },
  });
  assert.equal(client.calls[0].payload.auto_recurring.frequency, 12);
  assert.equal(client.calls[0].payload.auto_recurring.frequency_type, "months");
  assert.equal(client.calls[0].payload.auto_recurring.transaction_amount, 1200);
});

test("Mercado Pago webhook normalizes approved status into paid lifecycle", async () => {
  const client = fixture();
  const provider = createMercadoPagoSubscriptionProvider({ client, mode: "test", allowPlanCreationOnCheckout: true });
  const event = await provider.verifyAndParseWebhook({ headers: {}, rawBody: Buffer.from("{}") });
  assert.equal(event.eventId, "evt_mp_1");
  assert.equal(event.eventType, "payment.succeeded");
  assert.equal(event.subscriptionId, "subscription:acme:unico");
  assert.equal(event.providerSubscriptionId, "preapproval_1");
});

test("Mercado Pago provider reuses a registered plan instead of creating a plan per checkout", async () => {
  const client = fixture();
  const planRegistry = {
    resolve(input) {
      assert.deepEqual(input, {
        priceId: "universo.start.month.br",
        provider: "mercadopago",
        environment: "test",
      });
      return {
        providerPlanId: "plan_registered",
        checkoutUrl: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=plan_registered",
      };
    },
  };
  const provider = createMercadoPagoSubscriptionProvider({ client, mode: "test", planRegistry });
  const result = await provider.createCheckoutSession({
    checkoutIntentId: "intent_registered",
    tenantId: "tenant:acme",
    workspaceId: "workspace:acme:universo",
    subscriptionId: "subscription:acme:universo",
    successUrl: "https://sitedauni.com/apps/universo/",
    price: {
      productId: "uni.verso",
      planId: "start",
      priceId: "universo.start.month.br",
      interval: "month",
      amountMinor: 4900,
      currency: "BRL",
    },
  });

  assert.equal(result.providerCheckoutId, "plan_registered");
  assert.match(result.checkoutUrl, /plan_registered/);
  assert.equal(client.calls.length, 0);
});

test("Mercado Pago checkout fails closed when no external plan binding is available", async () => {
  const client = fixture();
  const provider = createMercadoPagoSubscriptionProvider({ client, mode: "test" });

  await assert.rejects(
    () => provider.createCheckoutSession({
      checkoutIntentId: "intent_unbound",
      tenantId: "tenant:acme",
      workspaceId: "workspace:acme:universo",
      subscriptionId: "subscription:acme:universo",
      successUrl: "https://sitedauni.com/apps/universo/",
      price: {
        productId: "uni.verso",
        planId: "start",
        priceId: "universo.start.month.br",
        interval: "month",
        amountMinor: 4900,
        currency: "BRL",
      },
    }),
    /mercadopago_provider_plan_binding_required/,
  );

  assert.equal(client.calls.length, 0);
});
