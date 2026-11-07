import test from "node:test";
import assert from "node:assert/strict";

import { createCanonicalId } from "../../contracts/src/canonical-ids.mjs";
import {
  MITRA_COMMERCIAL_MODE_V1,
  MITRA_PLAN_CATALOG_V1,
  createMitraCheckoutIntentV1,
  createMitraPlanCatalogV1,
  createMitraPlanDefinitionV1,
  resolveMitraPlanV1,
  assertMitraCheckoutIntentSafeV1,
} from "../src/mitra-commercial-access-v1.mjs";

const planId = createCanonicalId({
  family: "plan",
  segments: ["mitra", "test"],
});

const approvedFixture = createMitraPlanCatalogV1({
  plans: [
    {
      planId,
      label: "Mitra Test Fixture",
      currency: "BRL",
      monthlyAmount: 321,
      pricingStatus: "approved",
      sellable: true,
      capabilities: ["office-access", "private-research"],
    },
  ],
});

test("canonical Mitra catalog starts fail-closed until a commercial price decision exists", () => {
  assert.equal(MITRA_PLAN_CATALOG_V1.productId, "mitra");
  assert.equal(MITRA_PLAN_CATALOG_V1.pricingDecisionRequired, true);
  assert.deepEqual(MITRA_PLAN_CATALOG_V1.plans, []);
});

test("plan definition requires canonical plan id and approved price before sellable=true", () => {
  assert.throws(
    () =>
      createMitraPlanDefinitionV1({
        planId,
        label: "Pending",
        pricingStatus: "pending_decision",
        sellable: true,
      }),
    (error) => error?.code === "MITRA_PLAN_NOT_APPROVED",
  );

  const plan = resolveMitraPlanV1(approvedFixture, planId);
  assert.equal(plan.monthlyAmount, 321);
  assert.equal(plan.currency, "BRL");
  assert.equal(plan.sellable, true);
});

test("unknown plans fail closed", () => {
  assert.throws(
    () => resolveMitraPlanV1(approvedFixture, "plan.mitra.unknown"),
    (error) => error?.code === "MITRA_PLAN_UNKNOWN",
  );
});

test("checkout intent is deterministic for the same buyer/plan/idempotency key", () => {
  const input = {
    catalog: approvedFixture,
    planId,
    buyerRef: "igor@example.invalid",
    idempotencyKey: "order-001",
    createdAt: "2026-09-08T04:20:00.000Z",
  };

  const first = createMitraCheckoutIntentV1(input);
  const replay = createMitraCheckoutIntentV1(input);
  const changed = createMitraCheckoutIntentV1({
    ...input,
    idempotencyKey: "order-002",
  });

  assert.equal(first.checkoutIntentId, replay.checkoutIntentId);
  assert.notEqual(first.checkoutIntentId, changed.checkoutIntentId);
  assert.equal(first.plan.monthlyAmount, 321);
  assert.equal(first.paymentMode, MITRA_COMMERCIAL_MODE_V1);
  assert.equal(first.automaticCharge, false);
  assert.equal(first.productionWriteAuthorized, false);
  assert.equal(first.subscriptionActivated, false);
  assert.equal(first.entitlementActivated, false);
  assert.equal(assertMitraCheckoutIntentSafeV1(first), true);
});

test("browser supplied price is ignored because checkout resolves value from canonical catalog", () => {
  const intent = createMitraCheckoutIntentV1({
    catalog: approvedFixture,
    planId,
    buyerRef: "buyer-123",
    idempotencyKey: "order-price-test",
    createdAt: "2026-09-08T04:20:00.000Z",
    monthlyAmount: 1,
    price: 1,
  });

  assert.equal(intent.plan.monthlyAmount, 321);
});

test("raw buyer reference is not exposed in checkout receipt", () => {
  const buyerRef = "person@example.invalid";
  const intent = createMitraCheckoutIntentV1({
    catalog: approvedFixture,
    planId,
    buyerRef,
    idempotencyKey: "privacy-001",
    createdAt: "2026-09-08T04:20:00.000Z",
  });

  const serialized = JSON.stringify(intent);
  assert.equal(serialized.includes(buyerRef), false);
  assert.match(intent.buyerReferenceHash, /^[0-9a-f]{64}$/);
});

test("pending pricing cannot create a checkout intent", () => {
  const pendingCatalog = createMitraPlanCatalogV1({
    plans: [
      {
        planId,
        label: "Pending commercial decision",
        monthlyAmount: null,
        pricingStatus: "pending_decision",
        sellable: false,
      },
    ],
  });

  assert.throws(
    () =>
      createMitraCheckoutIntentV1({
        catalog: pendingCatalog,
        planId,
        buyerRef: "buyer",
        idempotencyKey: "blocked",
      }),
    (error) => error?.code === "MITRA_PLAN_NOT_SELLABLE",
  );
});
