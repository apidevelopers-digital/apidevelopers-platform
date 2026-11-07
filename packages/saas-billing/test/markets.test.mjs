import assert from "node:assert/strict";
import test from "node:test";

import {
  BILLING_MARKETS_V1,
  MARKET_STATUS,
  assertBillableMarket,
  resolveBillingMarket,
} from "../src/markets.mjs";

test("billing market is resolved by billing country, never by interface locale", () => {
  assert.equal(resolveBillingMarket("BR").currency, "BRL");
  assert.equal(resolveBillingMarket("US").currency, "USD");
  assert.equal(resolveBillingMarket("DE").currency, "EUR");
  assert.equal(resolveBillingMarket("JP").currency, "JPY");
  assert.equal(resolveBillingMarket("KR").currency, "KRW");
  assert.equal(resolveBillingMarket("CN").currency, "CNY");

  assert.throws(() => resolveBillingMarket("ja"), /market not configured/);
  assert.throws(() => resolveBillingMarket("en"), /market not configured/);
});

test("only Brazil is provider-configured today; global markets fail closed", () => {
  const br = assertBillableMarket("BR");
  assert.equal(br.provider, "mercadopago");
  assert.equal(br.providerStatus, MARKET_STATUS.configuredTest);

  for (const country of ["US", "DE", "JP", "KR", "CN"]) {
    const market = resolveBillingMarket(country);
    assert.equal(market.provider, null);
    assert.equal(market.providerCandidate, "stripe");
    assert.equal(market.providerStatus, MARKET_STATUS.providerPending);
    assert.throws(() => assertBillableMarket(country), /provider not configured/);
  }
});

test("market matrix has unique country ownership and no commercial prices", () => {
  const countries = BILLING_MARKETS_V1.flatMap((market) => market.countries);
  assert.equal(new Set(countries).size, countries.length);
  for (const market of BILLING_MARKETS_V1) {
    assert.equal("amountMinor" in market, false);
    assert.equal("priceId" in market, false);
  }
});
