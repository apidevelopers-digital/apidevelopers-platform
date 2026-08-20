import assert from "node:assert/strict";
import test from "node:test";

import {
  createPublicBillingHttp,
  PUBLIC_BILLING_ROUTES,
} from "../src/saas-billing-public-http.mjs";

function fixture({ allowed = true } = {}) {
  const calls = { create: [], rate: [] };
  const publicCheckoutIntent = {
    async create(input) {
      calls.create.push(input);
      return {
        intentId: "pub_fixture_1",
        status: "prepared",
        mode: "test",
        provider: "mercadopago",
        providerInvocationAllowed: false,
        priceId: input.priceId,
        productId: "imuni",
        planId: "pro",
        currency: "BRL",
        amountMinor: 16900,
        interval: "month",
        payerEmail: input.payerEmail,
        surfaceId: input.surfaceId,
        successUrl: "https://imuni.sitedauni.com/billing/success",
        cancelUrl: "https://imuni.sitedauni.com/billing/cancel",
        createdAt: "2026-08-11T12:00:00.000Z",
      };
    },
  };
  const rateLimiter = {
    async check(input) {
      calls.rate.push(input);
      return allowed ? { allowed: true } : { allowed: false, retryAfterSeconds: 30 };
    },
  };
  return { calls, http: createPublicBillingHttp({ publicCheckoutIntent, rateLimiter }) };
}

function request(body, headers = {}) {
  return {
    method: "POST",
    pathname: PUBLIC_BILLING_ROUTES.checkoutIntent,
    headers: {
      origin: "https://imuni.sitedauni.com",
      "idempotency-key": "public:imuni:fixture:1",
      "x-forwarded-for": "203.0.113.10",
      ...headers,
    },
    rawBody: Buffer.from(JSON.stringify(body)),
  };
}

test("public checkout HTTP resolves through service and never exposes email or return URLs", async () => {
  const { http, calls } = fixture();
  const result = await http.handle(
    request({
      priceId: "imuni.pro.month.br",
      payerEmail: "cliente@example.com",
      surfaceId: "imuni-public",
      consentAccepted: true,
    }),
  );

  assert.equal(result.status, 201);
  assert.equal(result.payload.checkoutIntentId, "pub_fixture_1");
  assert.equal(result.payload.provider, "mercadopago");
  assert.equal(result.payload.providerInvocationAllowed, false);
  assert.equal(result.payload.amountMinor, 16900);
  assert.equal("payerEmail" in result.payload, false);
  assert.equal("successUrl" in result.payload, false);
  assert.equal("cancelUrl" in result.payload, false);
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0].origin, "https://imuni.sitedauni.com");
  assert.equal(calls.create[0].idempotencyKey, "public:imuni:fixture:1");
});

test("public checkout derives origin and idempotency from headers, not body", async () => {
  const { http, calls } = fixture();
  const result = await http.handle(
    request({
      priceId: "imuni.pro.month.br",
      payerEmail: "cliente@example.com",
      surfaceId: "imuni-public",
      consentAccepted: true,
      origin: "https://evil.example",
      idempotencyKey: "evil",
    }),
  );

  assert.equal(result.status, 201);
  assert.equal(calls.create[0].origin, "https://imuni.sitedauni.com");
  assert.equal(calls.create[0].idempotencyKey, "public:imuni:fixture:1");
});

test("public checkout rejects amount, currency, provider, redirects and subscription authority from client", async () => {
  for (const field of [
    "amountMinor",
    "currency",
    "provider",
    "successUrl",
    "cancelUrl",
    "tenantId",
    "workspaceId",
    "subscriptionId",
  ]) {
    const { http, calls } = fixture();
    const result = await http.handle(
      request({
        priceId: "imuni.pro.month.br",
        payerEmail: "cliente@example.com",
        surfaceId: "imuni-public",
        consentAccepted: true,
        [field]: field === "amountMinor" ? 1 : "forbidden",
      }),
    );
    assert.equal(result.status, 400, field);
    assert.equal(calls.create.length, 0, field);
  }
});

test("public checkout requires origin, idempotency key and an available rate limiter decision", async () => {
  const one = fixture();
  const noOrigin = await one.http.handle(
    request(
      {
        priceId: "imuni.pro.month.br",
        payerEmail: "cliente@example.com",
        surfaceId: "imuni-public",
        consentAccepted: true,
      },
      { origin: "" },
    ),
  );
  assert.equal(noOrigin.status, 400);

  const two = fixture();
  const noKey = await two.http.handle(
    request(
      {
        priceId: "imuni.pro.month.br",
        payerEmail: "cliente@example.com",
        surfaceId: "imuni-public",
        consentAccepted: true,
      },
      { "idempotency-key": "" },
    ),
  );
  assert.equal(noKey.status, 400);

  const three = fixture({ allowed: false });
  const limited = await three.http.handle(
    request({
      priceId: "imuni.pro.month.br",
      payerEmail: "cliente@example.com",
      surfaceId: "imuni-public",
      consentAccepted: true,
    }),
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.payload.retryAfterSeconds, 30);
  assert.equal(three.calls.create.length, 0);
});

test("public checkout maps origin and consent failures without leaking internals", async () => {
  const origin = fixture();
  origin.http = createPublicBillingHttp({
    publicCheckoutIntent: {
      async create() {
        throw new Error("origin_not_allowed");
      },
    },
    rateLimiter: { async check() { return { allowed: true }; } },
  });
  const originResult = await origin.http.handle(
    request({
      priceId: "imuni.pro.month.br",
      payerEmail: "cliente@example.com",
      surfaceId: "imuni-public",
      consentAccepted: true,
    }),
  );
  assert.equal(originResult.status, 403);
  assert.deepEqual(originResult.payload, { error: "public_checkout_origin_rejected" });

  const consent = fixture();
  consent.http = createPublicBillingHttp({
    publicCheckoutIntent: {
      async create() {
        throw new Error("billing_consent_required");
      },
    },
    rateLimiter: { async check() { return { allowed: true }; } },
  });
  const consentResult = await consent.http.handle(
    request({
      priceId: "imuni.pro.month.br",
      payerEmail: "cliente@example.com",
      surfaceId: "imuni-public",
      consentAccepted: false,
    }),
  );
  assert.equal(consentResult.status, 400);
  assert.deepEqual(consentResult.payload, { error: "billing_consent_required" });
});
