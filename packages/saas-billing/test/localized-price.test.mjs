import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveLocalizedPrice,
  deriveLocalizedPriceSet,
} from "../src/localized-price.mjs";

const approvedBasePrices = [
  { priceId: "unisocial.start.month.br", productId: "uni.social", planId: "start", interval: "month", amountMinor: 4990, currency: "BRL", active: false },
  { priceId: "unisocial.pro.month.br", productId: "uni.social", planId: "pro", interval: "month", amountMinor: 14990, currency: "BRL", active: false },
  { priceId: "unisocial.scale.month.br", productId: "uni.social", planId: "scale", interval: "month", amountMinor: 34990, currency: "BRL", active: false },
];

const quote = (quoteCurrency, rate) => ({
  baseCurrency: "BRL",
  quoteCurrency,
  rate,
  asOf: "2026-08-12T18:00:00Z",
  source: "test-fixture",
});

test("Brazil keeps the canonical BRL amount without FX", () => {
  const localized = deriveLocalizedPrice({
    basePrice: approvedBasePrices[0],
    billingCountryCode: "BR",
  });

  assert.equal(localized.amountMinor, 4990);
  assert.equal(localized.currency, "BRL");
  assert.equal(localized.pricingModel, "base_catalog");
  assert.equal(localized.fxQuote, null);
  assert.equal(localized.active, false);
});

test("USD/EUR/CNY prices are direct FX conversions with zero regional uplift", () => {
  const usd = deriveLocalizedPrice({
    basePrice: approvedBasePrices[0],
    billingCountryCode: "US",
    fxQuote: quote("USD", "0.20"),
  });
  const eur = deriveLocalizedPrice({
    basePrice: approvedBasePrices[1],
    billingCountryCode: "DE",
    fxQuote: quote("EUR", "0.18"),
  });
  const cny = deriveLocalizedPrice({
    basePrice: approvedBasePrices[2],
    billingCountryCode: "CN",
    fxQuote: quote("CNY", "1.42"),
  });

  assert.equal(usd.amountMinor, 998);
  assert.equal(usd.currency, "USD");
  assert.equal(eur.amountMinor, 2698);
  assert.equal(eur.currency, "EUR");
  assert.equal(cny.amountMinor, 49686);
  assert.equal(cny.currency, "CNY");
  for (const item of [usd, eur, cny]) {
    assert.equal(item.pricingModel, "direct_fx_conversion");
    assert.equal(item.marketUpliftBps, 0);
    assert.equal(item.active, false);
  }
});

test("JPY and KRW use zero-decimal local units", () => {
  const jpy = deriveLocalizedPrice({
    basePrice: approvedBasePrices[0],
    billingCountryCode: "JP",
    fxQuote: quote("JPY", "30"),
  });
  const krw = deriveLocalizedPrice({
    basePrice: approvedBasePrices[0],
    billingCountryCode: "KR",
    fxQuote: quote("KRW", "300"),
  });

  assert.equal(jpy.amountMinor, 1497);
  assert.equal(jpy.currency, "JPY");
  assert.equal(krw.amountMinor, 14970);
  assert.equal(krw.currency, "KRW");
});

test("market currency must match the supplied FX quote", () => {
  assert.throws(
    () =>
      deriveLocalizedPrice({
        basePrice: approvedBasePrices[0],
        billingCountryCode: "US",
        fxQuote: quote("EUR", "0.18"),
      }),
    /does not match market currency USD/,
  );
});

test("locale is never accepted as billing-country authority", () => {
  assert.throws(
    () =>
      deriveLocalizedPrice({
        basePrice: approvedBasePrices[0],
        billingCountryCode: "ja",
        fxQuote: quote("JPY", "30"),
      }),
    /billing market not configured for country: JA/,
  );
});

test("a complete plan set can be derived from one market quote", () => {
  const prices = deriveLocalizedPriceSet({
    basePrices: approvedBasePrices,
    billingCountryCode: "US",
    fxQuote: quote("USD", "0.20"),
  });
  assert.deepEqual(prices.map((item) => item.amountMinor), [998, 2998, 6998]);
  assert.deepEqual(prices.map((item) => item.currency), ["USD", "USD", "USD"]);
});
