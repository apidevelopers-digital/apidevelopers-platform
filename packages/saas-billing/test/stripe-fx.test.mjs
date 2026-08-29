import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStripeFxQuoteRequest,
  normalizeStripeFxQuote,
} from "../src/providers/stripe-fx.mjs";
import { convertBasePriceMinor } from "../src/fx.mjs";

const now = new Date("2026-08-12T18:00:00Z");

test("Stripe FX request uses local presentment currency and BRL settlement", () => {
  const request = buildStripeFxQuoteRequest({
    presentmentCurrency: "USD",
    settlementCurrency: "BRL",
  });

  assert.equal(request.endpoint, "/v1/fx_quotes");
  assert.deepEqual(request.params, {
    to_currency: "brl",
    from_currencies: ["usd"],
    lock_duration: "hour",
    usage: { type: "payment" },
  });
});

test("Stripe base_rate is normalized as divide operation for BRL base pricing", () => {
  const normalized = normalizeStripeFxQuote({
    presentmentCurrency: "USD",
    settlementCurrency: "BRL",
    now,
    stripeFxQuote: {
      id: "fxq_test_usd_brl",
      created: 1786555800,
      lock_duration: "hour",
      lock_expires_at: 1786559400,
      lock_status: "active",
      to_currency: "brl",
      usage: { type: "payment" },
      rates: {
        usd: {
          rate_details: {
            base_rate: 5,
            fx_fee_rate: 0.02,
          },
        },
      },
    },
  });

  assert.equal(normalized.provider, "stripe");
  assert.equal(normalized.fxQuote.baseCurrency, "BRL");
  assert.equal(normalized.fxQuote.quoteCurrency, "USD");
  assert.equal(normalized.fxQuote.rate, "5");
  assert.equal(normalized.fxQuote.operation, "divide");

  const localized = convertBasePriceMinor({
    amountMinor: 4990,
    quote: normalized.fxQuote,
  });
  assert.equal(localized.amountMinor, 998);
  assert.equal(localized.currency, "USD");
});

test("Stripe FX quote fails closed when expired or settlement currency mismatches", () => {
  const base = {
    id: "fxq_test",
    created: 1786555800,
    lock_duration: "hour",
    lock_expires_at: 1786559400,
    lock_status: "active",
    to_currency: "brl",
    usage: { type: "payment" },
    rates: {
      eur: { rate_details: { base_rate: 6 } },
    },
  };

  assert.throws(
    () =>
      normalizeStripeFxQuote({
        stripeFxQuote: { ...base, lock_status: "expired" },
        presentmentCurrency: "EUR",
        now,
      }),
    /not active/,
  );

  assert.throws(
    () =>
      normalizeStripeFxQuote({
        stripeFxQuote: { ...base, to_currency: "usd" },
        presentmentCurrency: "EUR",
        now,
      }),
    /settlement currency must be BRL/,
  );
});
