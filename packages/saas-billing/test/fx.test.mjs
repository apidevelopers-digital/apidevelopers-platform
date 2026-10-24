import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_PRICE_CURRENCY,
  convertBasePriceMinor,
  createFxQuote,
  getMinorUnitDigits,
} from "../src/fx.mjs";

const asOf = "2026-08-12T17:00:00Z";
const source = "test-fixture";

test("direct FX conversion keeps BRL as canonical base and applies zero market uplift", () => {
  const converted = convertBasePriceMinor({
    amountMinor: 10000,
    quote: {
      baseCurrency: "BRL",
      quoteCurrency: "USD",
      rate: "0.20",
      asOf,
      source,
    },
  });

  assert.equal(BASE_PRICE_CURRENCY, "BRL");
  assert.equal(converted.amountMinor, 2000);
  assert.equal(converted.currency, "USD");
  assert.equal(converted.pricingModel, "direct_fx_conversion");
  assert.equal(converted.marketUpliftBps, 0);
  assert.equal(converted.fxQuote.operation, "multiply");
});

test("provider settlement-direction rate can be divided without floating inversion", () => {
  const converted = convertBasePriceMinor({
    amountMinor: 4990,
    quote: {
      baseCurrency: "BRL",
      quoteCurrency: "USD",
      rate: "5",
      operation: "divide",
      asOf,
      source: "provider-base-rate",
    },
  });

  assert.equal(converted.amountMinor, 998);
  assert.equal(converted.currency, "USD");
  assert.equal(converted.fxQuote.rate, "5");
  assert.equal(converted.fxQuote.operation, "divide");
  assert.equal(converted.marketUpliftBps, 0);
});

test("zero-decimal currencies round only to their smallest chargeable unit", () => {
  const jpy = convertBasePriceMinor({
    amountMinor: 9990,
    quote: {
      quoteCurrency: "JPY",
      rate: "30",
      asOf,
      source,
    },
  });

  const krw = convertBasePriceMinor({
    amountMinor: 9990,
    quote: {
      quoteCurrency: "KRW",
      rate: "300",
      asOf,
      source,
    },
  });

  assert.equal(jpy.amountMinor, 2997);
  assert.equal(krw.amountMinor, 29970);
  assert.equal(getMinorUnitDigits("JPY"), 0);
  assert.equal(getMinorUnitDigits("KRW"), 0);
});

test("fractional direct conversion uses deterministic half-up rounding", () => {
  const usd = convertBasePriceMinor({
    amountMinor: 9999,
    quote: {
      quoteCurrency: "USD",
      rate: "0.20123",
      asOf,
      source,
    },
  });
  assert.equal(usd.amountMinor, 2012);
});

test("FX quote requires auditable source and timestamp", () => {
  assert.throws(
    () => createFxQuote({ quoteCurrency: "USD", rate: "0.20", asOf, source: "" }),
    /source is required/,
  );
  assert.throws(
    () => createFxQuote({ quoteCurrency: "USD", rate: "0.20", asOf: "not-a-date", source }),
    /asOf must be a valid ISO date\/time/,
  );
});

test("unsupported FX operations fail closed", () => {
  assert.throws(
    () =>
      createFxQuote({
        quoteCurrency: "USD",
        rate: "5",
        operation: "invert",
        asOf,
        source,
      }),
    /unsupported FX rate operation/,
  );
});

test("locale strings cannot be used as billing currencies", () => {
  assert.throws(
    () => createFxQuote({ quoteCurrency: "ja", rate: "30", asOf, source }),
    /unsupported currency/,
  );
  assert.throws(
    () => createFxQuote({ quoteCurrency: "en", rate: "0.20", asOf, source }),
    /unsupported currency/,
  );
});
