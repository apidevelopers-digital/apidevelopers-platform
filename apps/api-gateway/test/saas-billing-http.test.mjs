import assert from "node:assert/strict";
import test from "node:test";

import { createSaasBillingHttp } from "../src/saas-billing-http.mjs";
import {
  createBillingReadyApp,
  startBillingHttpServer,
} from "../src/saas-billing-server.mjs";

function authenticatorFor(tenantId = "tenant:acme") {
  return {
    async authenticate(headers) {
      return headers.authorization === "Bearer fixture"
        ? { principal: { tenantId } }
        : null;
    },
  };
}

function billingFixture() {
  const calls = { checkout: [], webhook: [] };
  return {
    calls,
    async createCheckout(input) {
      calls.checkout.push(input);
      return {
        checkoutIntentId: input.checkoutIntentId,
        checkoutUrl: "https://checkout.stripe.test/session",
        expiresAt: "2026-08-11T06:00:00.000Z",
        currency: "BRL",
        amountMinor: 12345,
        interval: "month",
        provider: "stripe",
        providerMode: "test",
        providerCheckoutId: "secret-provider-id-not-for-http",
      };
    },
    async handleWebhook(input) {
      calls.webhook.push(input);
      return { eventId: "evt_fixture", transition: "active" };
    },
  };
}

test("billing routes are unavailable when billing is not configured", async () => {
  const http = createSaasBillingHttp();
  const checkout = await http.handle({
    method: "POST",
    pathname: "/v1/saas/billing/checkout",
    rawBody: Buffer.from("{}"),
  });
  assert.equal(checkout.status, 503);
  assert.equal(checkout.payload.error, "saas_billing_unavailable");

  const webhook = await http.handle({
    method: "POST",
    pathname: "/v1/saas/billing/webhooks/stripe",
    rawBody: Buffer.from("{}"),
  });
  assert.equal(webhook.status, 503);
});

test("checkout requires authenticated tenant and derives tenant from identity", async () => {
  const billing = billingFixture();
  const http = createSaasBillingHttp({
    authenticator: authenticatorFor(),
    saasBilling: billing,
  });

  const unauthorized = await http.handle({
    method: "POST",
    pathname: "/v1/saas/billing/checkout",
    rawBody: Buffer.from("{}"),
  });
  assert.equal(unauthorized.status, 401);

  const body = Buffer.from(JSON.stringify({
    checkoutIntentId: "checkout-1",
    tenantId: "tenant:acme",
    workspaceId: "workspace:acme:unico",
    subscriptionId: "subscription:acme:unico",
    priceId: "unico-pro-brl-month",
    successUrl: "https://unico.apidevelopers.digital/billing/success",
    cancelUrl: "https://unico.apidevelopers.digital/billing/cancel",
  }));
  const result = await http.handle({
    method: "POST",
    pathname: "/v1/saas/billing/checkout",
    headers: { authorization: "Bearer fixture" },
    rawBody: body,
  });

  assert.equal(result.status, 201);
  assert.equal(billing.calls.checkout.length, 1);
  assert.equal(billing.calls.checkout[0].tenantId, "tenant:acme");
  assert.equal(result.payload.amountMinor, 12345);
  assert.equal(result.payload.providerMode, "test");
  assert.equal("providerCheckoutId" in result.payload, false);
});

test("checkout rejects client tenant mismatch before billing", async () => {
  const billing = billingFixture();
  const http = createSaasBillingHttp({
    authenticator: authenticatorFor("tenant:alpha"),
    saasBilling: billing,
  });
  const result = await http.handle({
    method: "POST",
    pathname: "/v1/saas/billing/checkout",
    headers: { authorization: "Bearer fixture" },
    rawBody: Buffer.from(JSON.stringify({
      tenantId: "tenant:other",
      checkoutIntentId: "checkout-2",
    })),
  });
  assert.equal(result.status, 403);
  assert.equal(result.payload.error, "tenant_context_mismatch");
  assert.equal(billing.calls.checkout.length, 0);
});

test("Stripe webhook receives the exact raw body without user authentication", async () => {
  const billing = billingFixture();
  const http = createSaasBillingHttp({ saasBilling: billing });
  const rawBody = Buffer.from('{"exact":true}\n');
  const result = await http.handle({
    method: "POST",
    pathname: "/v1/saas/billing/webhooks/stripe",
    headers: { "stripe-signature": "sig_fixture" },
    rawBody,
  });
  assert.equal(result.status, 200);
  assert.equal(result.payload.received, true);
  assert.equal(billing.calls.webhook.length, 1);
  assert.equal(billing.calls.webhook[0].rawBody, rawBody);
  assert.equal(billing.calls.webhook[0].headers["stripe-signature"], "sig_fixture");
});

test("billing-ready HTTP server preserves raw webhook bytes end-to-end", async (t) => {
  const billing = billingFixture();
  const baseApp = {
    async handleRequest() {
      return {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "not_found" }),
      };
    },
  };
  const app = createBillingReadyApp({ baseApp, saasBilling: billing });
  const server = await startBillingHttpServer({ app });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  const raw = '{"webhook":"raw"}\n';
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/saas/billing/webhooks/stripe`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "sig_fixture",
      },
      body: raw,
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    received: true,
    eventId: "evt_fixture",
    transition: "active",
  });
  assert.equal(
    billing.calls.webhook[0].rawBody.toString("utf8"),
    raw,
  );
});
