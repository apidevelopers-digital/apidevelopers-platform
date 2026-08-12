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

test("global markets use locked Stripe FX quote policy and no commercial uplift", () => {
  assert.equal(FX_SOURCE_POLICY_V1.marketUpliftBps, 0);
  assert.equal(FX_SOURCE_POLICY_V1.transactionalSource.lockDuration, "hour");
  assert.equal(FX_SOURCE_POLICY_V1.transactionalSource.customerPricingRateField, "base_rate");
  assert.equal(FX_SOURCE_POLICY_V1.transactionalSource.feeTreatment, "merchant_absorbed");
  assert.equal(FX_SOURCE_POLICY_V1.fallback.mode, "fail_closed");
  assert.equal(FX_SOURCE_POLICY_V1.fallback.allowStaleQuote, false);

  for (const currency of ["USD", "EUR", "JPY", "KRW", "CNY"]) {
    const policy = getFxSourcePolicy({ targetCurrency: currency });
    assert.equal(policy.required, true);
    assert.equal(policy.source, "stripe_fx_quotes");
    assert.equal(policy.providerStatus, "provider_pending");
    assert.equal(policy.lockDuration, "hour");
    assert.equal(policy.customerPricingRateField, "base_rate");
    assert.equal(policy.feeTreatment, "merchant_absorbed");
  }
});

test("unsupported currencies fail closed", () => {
  assert.throws(
    () => getFxSourcePolicy({ targetCourrency: "GBP" }),
    /unsupported FX target currency/,
  );
  assert.throws(
    () => getFxSourcePolicy({ targetCurrency: "ja" }),
    /unsupported FX target currency/,
  );
});

test("locked quote must be active and unexpired", () => {
  const now = new Date("2026-08-12T17:30:00Z");

  assert.equal(
    assertLockedFxQuoteUsable({
      quoteId: "fxq_test",
      lockStatus: "active",
      lockExpiresAt: "2026-08-12T18:00:00Z",
      now,
    }),
    true,
  );

  assert.throws(
    () =>
      assertLockedFxQuoteUsable({
        quoteId: "fxq_test",
        lockStatus: "expired",
        lockExpiresAt: "2026-08-12T18:00:00Z",
        now,
      }),
    /not active/,
  );

  assert.throws(
    () =>
      assertLockedFxQuoteUsable({
        quoteId: "fxq_test",
        lockStatus: "active",
        lockExpiresAt: "2026-08-12T17:00:00Z",
        now,
      }),
    /expired/,
   );
});
