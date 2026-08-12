import assert from "node:assert/strict";
import test from "node:test";

import {
  FX_SOURCE_POLICY_V1,
  assertLockedFxQuoteUsable,
  getFxSourcePolicy,
} from "../src/fx-policy.mjs";

test("BRL checkout does not require FX", () => {
  assert.deepEqual(getFxSourcePolicy({ targetCurrency: "BRL" }), {
    required: false,
    source: null,
    lockDuration: null,
    currency: "BRL",
  });
});

test("global markets stay fail-closed until an operational FX source is approved", () => {
  assert.equal(FX_SOURCE_POLICY_V1.marketUpliftBps, 0);
  assert.equal(FX_SOURCE_POLICY_V1.transactionalSource.providerCandidate, null);
  assert.equal(FX_SOURCE_POLICY_V1.transactionalSource.status, "pending");
  assert.equal(FX_SOURCE_POLICY_V1.transactionalSource.feeTreatment, "merchant_absorbed");
  assert.equal(FX_SOURCE_POLICY_V1.fallback.mode, "fail_closed");
  assert.equal(FX_SOURCE_POLICY_V1.fallback.allowStaleQuote, false);

  for (const currency of ["USD", "EUR", "JPY", "KRW", "CNY"]) {
    const policy = getFxSourcePolicy({ targetCurrency: currency });
    assert.equal(policy.required, true);
    assert.equal(policy.source, null);
    assert.equal(policy.providerCandidate, null);
    assert.equal(policy.providerStatus, "pending");
    assert.equal(policy.lockDuration, null);
    assert.equal(policy.feeTreatment, "merchant_absorbed");
    assert.equal(policy.failClosed, true);
  }
});

test("Stripe FX Quotes is experimental and has no financial authority for BR merchant", () => {
  const stripe = FX_SOURCE_POLICY_V1.experimentalSources[0];
  assert.equal(stripe.providerCandidate, "stripe");
  assert.equal(stripe.capability, "fx_quotes");
  assert.equal(stripe.status, "blocked_for_br_merchant_preview");
  assert.equal(stripe.reasonCode, "merchant_country_not_supported_in_preview");
  assert.equal(stripe.customerPricingRateField, "base_rate");
  assert.equal(stripe.quoteDirection, "local_presentment_to_brl_settlement");
});

test("institutional public rates remain reference-only", () => {
  assert.deepEqual(FX_SOURCE_POLICY_V1.referenceOnlySources, ["bcb_ptax", "ecb_reference_rates"]);
  assert.deepEqual(FX_SOURCE_POLICY_V1.referenceCoverage.bcb_ptax, ["USD", "EUR", "JPY"]);
  assert.deepEqual(
    FX_SOURCE_POLICY_V1.referenceCoverage.ecb_reference_rates,
    ["BRL", "USD", "EUR", "JPY","KRW", "CNY"],
  );
});

test("unsupported currencies fail closed", () => {
  assert.throws(() => getFxSourcePolicy({ targetCurrency: "GBP" }), /unsupported FX target currency/);
  assert.throws(() => getFxSourcePolicy({ targetCurrency: "ja" }), /unsupported FX target currency/);
});

test("locked quote must be active and unexpired", () => {
  const now = new Date("2026-08-12T17:30:00Z");
  assert.equal(assertLockedFxQuoteUsable({
    quoteId: "fxq_test",
    lockStatus: "active",
    lockExpiresAt: "2026-08-12T18:00:00Z",
    now,
  }), true);

  assert.throws(() => assertLockedFxQuoteUsable({
    quoteId: "fxq_test",
    lockStatus: "expired",
    lockExpiresAt: "2026-08-12T18:00:00Z",
    now,
  }), /not active/);

  assert.throws(() => assertLockedFxQuoteUsable({
    quoteId: "fxq_test",
    lockStatus: "active",
    lockExpiresAt: "2026-08-12T17:00:00Z",
    now,
  }), /expired/);
});
