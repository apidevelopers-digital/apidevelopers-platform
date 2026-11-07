import assert from "node:assert/strict";
import test from "node:test";

import { createBillingCatalog } from "../src/catalog.mjs";
import { createPublicCheckoutIntentService } from "../src/public-checkout.mjs";

function createFixture({ store } = {}) {
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

  const items = new Map();
  const effectiveStore =
    store ??
    {
      items,
      async getPublicCheckoutIntent(key) {
        return items.get(key) ?? null;
      },
      async putPublicCheckoutIntent(key, intent) {
        if (!items.has(key)) items.set(key, intent);
        return items.get(key);
      },
    };

  const service = createPublicCheckoutIntentService({
    catalog,
    store: effectiveStore,
    mode: "test",
    surfaces: [
      {
        surfaceId: "imuni-public",
        productId: "imuni",
        allowedOrigins: ["https://imuni.sitedauni.com"],
        successUrl: "https://imuni.sitedauni.com/billing/success",
        cancelUrl: "https://imuni.sitedauni.com/billing/cancel",
      },
    ],
    clock: () => new Date("2026-08-11T12:00:00.000Z"),
    idFactory: () => "pub_idempotency_fixture",
  });

  return { service, items };
}

function validInput() {
  return {
    priceId: "imuni.pro.month.br",
    payerEmail: "cliente@example.com",
    surfaceId: "imuni-public",
    origin: "https://imuni.sitedauni.com",
    idempotencyKey: "public:imuni:idempotency:1",
    consentAccepted: true,
  };
}

test("idempotency replay validates consent and origin before returning an existing intent", async () => {
  const { service } = createFixture();
  const input = validInput();

  await service.create(input);

  await assert.rejects(
    () =>
      service.create({
        ...input,
        origin: "https://evil.example",
      }),
    /origin_not_allowed/,
  );

  await assert.rejects(
    () =>
      service.create({
        ...input,
        consentAccepted: false,
      }),
    /billing_consent_required/,
  );
});

test("same idempotency key rejects changed checkout authority", async () => {
  const { service, items } = createFixture();
  const input = validInput();

  const first = await service.create(input);
  assert.equal(first.payerEmail, "cliente@example.com");

  await assert.rejects(
    () =>
      service.create({
        ...input,
        payerEmail: "outro@example.com",
      }),
    /idempotency_key_conflict/,
  );

  assert.equal(items.size, 1);
  assert.equal(items.get(input.idempotencyKey), first);
});

test("concurrent first-writer result is revalidated before it is returned", async () => {
  let committed = null;
  const store = {
    async getPublicCheckoutIntent() {
      return null;
    },
    async putPublicCheckoutIntent(_key, intent) {
      if (!committed) committed = intent;
      return committed;
    },
  };
  const { service } = createFixture({ store });
  const input = validInput();

  const first = await service.create(input);
  assert.equal(first.payerEmail, "cliente@example.com");

  await assert.rejects(
    () =>
      service.create({
        ...input,
        payerEmail: "corrida@example.com",
      }),
    /idempotency_key_conflict/,
  );
});
