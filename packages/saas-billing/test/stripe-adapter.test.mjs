import test from "node:test";
import assert from "node:assert/strict";
import { createStripeTestBillingProvider } from "../src/providers/stripe.mjs";

function stripeFixture() {
  const calls = [];
  return {
    calls,
    checkout: {
      sessions: {
        async create(payload, options) {
          calls.push({ payload, options });
          return {
            id: "cs_test_fixture",
            url: "https://checkout.stripe.test/session",
            expires_at: 1786428000,
          };
        },
      },
    },
    webhooks: {
      constructEvent(rawBody, signature, secret) {
        assert.equal(rawBody, '{"fixture":true}');
        assert.equal(signature, "sig_fixture");
        assert.equal(secret, "whsec_fixture");
        return {
          id: "evt_fixture_1",
          type: "invoice.payment_succeeded",
          created: 1786424400,
          data: {
            object: {
              customer: "cus_fixture",
              parent: {
                subscription_details: {
                  subscription: "sub_fixture",
                  metadata: { apd_subscription_id: "subscription:acme:unico" },
                },
              },
            },
          },
        };
      },
    },
  };
}

test("Stripe test adapter creates subscription checkout from server price and forwards idempotency", async () => {
  const stripe = stripeFixture();
  const provider = createStripeTestBillingProvider({ stripe, webhookSecret: "whsec_fixture" });
  const result = await provider.createCheckoutSession({
    checkoutIntentId: "checkout-1",
    tenantId: "tenant:acme",
    workspaceId: "workspace:acme:unico",
    subscriptionId: "subscription:acme:unico",
    successUrl: "https://unico.apidevelopers.digital/billing/success",
    cancelUrl: "https://unico.apidevelopers.digital/billing/cancel",
    price: {
      priceId: "unico-pro-brl-month",
      productId: "unico",
      planId: "pro",
      currency: "BRL",
      interval: "month",
      amountMinor: 12345,
      taxBehavior: "exclusive",
    },
  });
  assert.equal(result.providerCheckoutId, "cs_test_fixture");
  assert.equal(stripe.calls.length, 1);
  assert.equal(stripe.calls[0].payload.mode, "subscription");
  assert.equal(stripe.calls[0].payload.line_items[0].price_data.unit_amount, 12345);
  assert.equal(stripe.calls[0].payload.line_items[0].price_data.currency, "brl");
  assert.equal(stripe.calls[0].payload.subscription_data.metadata.apd_subscription_id, "subscription:acme:unico");
  assert.equal(stripe.calls[0].options.idempotencyKey, "checkout-1");
});

test("Stripe webhook signature is verified before event normalization", async () => {
  const stripe = stripeFixture();
  const provider = createStripeTestBillingProvider({ stripe, webhookSecret: "whsec_fixture" });
  const event = await provider.verifyAndParseWebhook({
    headers: { "stripe-signature": "sig_fixture" },
    rawBody: '{"fixture":true}',
  });
  assert.equal(event.eventId, "evt_fixture_1");
  assert.equal(event.eventType, "payment.succeeded");
  assert.equal(event.subscriptionId, "subscription:acme:unico");
  assert.equal(event.providerSubscriptionId, "sub_fixture");
  assert.equal(event.providerCustomerId, "cus_fixture");
});
