import assert from "node:assert/strict";
import test from "node:test";

import { createBillingCatalog } from "../src/catalog.mjs";
import {
  createPublicCheckoutIntentService,
  safePublicCheckoutIntent,
} from "../src/public-checkout.mjs";

function createStore() {
  const items = new Map();
  return {
    items,
    async getPublicCheckoutIntent(key) {
      return items.get(key) ?? null;
    },
    async putPublicCheckoutIntent(key, intent) {
      if (!items.has(key)) items.set(key, intent);
      return items.get(key);
    },
  };
}

function createService() {
  const catalog = createBillingCatalog([
    {
      priceId: "imuni.pro.month.br",
      productId: "imuni",
      planId: "pro",
      country: "BR",
      currency: "BRL",
      amountMinor: 16900,
      interval: "month",
      active: true,
      taxBehavior: "exclusive",
    },
  ]);
  const store = createStore();
  const service = createPublicCheckoutIntentService({
    catalog,
    store,
    mode: "test",
    surfaces: [
      {
        surfaceId: "imuni-public",
        allowedOrigins: ["https://imuni.sitedauni.com"],
        successUrl: "https://imuni.sitedauni.com/billing/success",
        cancelUrl: "https://imuni.sitedauni.com/billing/cancel",
      },
    ],
    clock: () => new Date("2026-08-11T12:00:00.000Z"),
    idFactory: () => "pub_fixture_1",
  });
  return { service, store };
}

test("public checkout resolves immutable server-side price and remains provider-disabled", async () => {
  const { service } = createService();
  const intent = await service.create({
    priceId: "imuni.pro.month.br",
    payerEmail: "Cliente@Example.com",
    surfaceId: "imuni-public",
    origin: "https://imuni.sitedauni.com",
    idempotencyKey: "public:imuni:fixture:1",
    consentAccepted: true,
  });

  assert.equal(intent.amountMinor, 16900);
  assert.equal(intent.currency, "BRL");
  assert.equal(intent.productId, "imuni");
  assert.equal(intent.planId, "pro");
  assert.equal(intent.interval, "month");
  assert.equal(intent.payerEmail, "cliente@example.com");
  assert.equal(intent.provider, "mercadopago");
  assert.equal(intent.providerInvocationAllowed, false);
  assert.equal(intent.status, "prepared");
});

test("public checkout rejects unapproved origins and missing consent", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.create({
        priceId: "imuni.pro.month.br",
        payerEmail: "client@example.com",
        surfaceId: "imuni-public",
        origin: "https://evil.example",
        idempotencyKey: "public:imuni:fixture:2",
        consentAccepted: true,
      }),
    /origin_not_allowed/,
  );

  await assert.rejects(
    () =>
      service.create({
        priceId: "imuni.pro.month.br",
        payerEmail: "client@example.com",
        surfaceId: "imuni-public",
        origin: "https://imuni.sitedauni.com",
        idempotencyKey: "public:imuni:fixture:3",
      }),
    /billing_consent_required/,
  );
});

test("public checkout is idempotent and safe response excludes payer email", async () => {
  const { service, store } = createService();
  const input = {
    priceId: "imuni.pro.month.br",
    payerEmail: "client@example.com",
    surfaceId: "imuni-public",
    origin: "https://imuni.sitedauni.com",
    idempotencyKey: "public:imuni:fixture:4",
    consentAccepted: true,
  };

  const first = await service.create(input);
  const second = await service.create(input);
  assert.equal(first, second);
  assert.equal(store.items.size, 1);

  const safe = safePublicCheckoutIntent(first);
  assert.equal(safe.checkoutIntentId, "pub_fixture_1");
  assert.equal(safe.providerInvocationAllowed, false);
  assert.equal("payerEmail" in safe, false);
  assert.equal("successUrl" in safe, false);
  assert.equal("cancelUrl" in safe, false);
});

test("inactive or unknown prices are rejected by the server-side catalog", async () => {
  const { service } = createService();
  await assert.rejects(
    () =>
      service.create({
        priceId: "imuni.unknown.month.br",
        payerEmail: "client@example.com",
        surfaceId: "imuni-public",
        origin: "https://imuni.sitedauni.com",
        idempotencyKey: "public:imuni:fixture:5",
        consentAccepted: true,
      }),
    /not found or inactive/,
  );
});
