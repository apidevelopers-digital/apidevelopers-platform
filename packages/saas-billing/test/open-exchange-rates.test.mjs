import assert from "node:assert/strict";
import test from "node:test";

import { convertBasePriceMinor } from "../src/fx.mjs";
import {
  OPEN_EXCHANGE_RATES_CANDIDATE_V1,
  buildOpenExchangeRatesRequest,
  normalizeOpenExchangeRatesSnapshot,
} from "../src/providers/open-exchange-rates.mjs";

const publishedAt = "2026-08-12T18:00:00.000Z";
const timestamp = Date.parse(publishedAt) / 1000;
const now = new Date("2026-08-12T18:30:00.000Z");

test("Open Exchange Rates request keeps credentials outside code and requests BRL base", () => {
  const request = buildOpenExchangeRatesRequest();

  assert.equal(request.endpoint, "/api/latest.json");
  assert.deepEqual(request.params, {
    base: "BRL",
    symbols: "USD,EUR,JPY,KRW,CNY",
  });
  assert.equal(request.authentication, "external_app_id");
  assert.equal("app_id" in request.params, false);
  assert.equal(OPEN_EXCHANGE_RATES_CANDIDATE_V1.financialAuthority, false);
});

test("Open Exchange Rates snapshot becomes a direct BRL to local market-rate quote", () => {
  const normalized = normalizeOpenExchangeRatesSnapshot({
    payload: {
      timestamp,
      base: "BRL",
      rates: { USD: 0.2, EUR: 0.18, JPY: 30, KRW: 300, CNY: 1.42 },
    },
    targetCurrency: "USD",
    now,
  });

  assert.equal(normalized.sourceStatus, "candidate_unconfigured");
  assert.equal(normalized.financialAuthority, false);
  assert.equal(normalized.fxQuote.baseCurrency, "BRL");
  assert.equal(normalized.fxQuote.quoteCurrency, "USD");
  assert.equal(normalized.fxQuote.rate, "0.2");
  assert.equal(normalized.fxQuote.operation, "multiply");
  assert.equal(normalized.fxQuote.asOf, publishedAt);

  const converted = convertBasePriceMinor({
    amountMinor: 4990,
    quote: normalized.fxQuote,
  });
  assert.equal(converted.amountMinor, 998);
  assert.equal(converted.currency, "USD");
  assert.equal(converted.marketUpliftBps, 0);
});

test("Open Exchange Rates snapshot fails closed when older than one hour", () => {
  assert.throws(
    () =>
      normalizeOpenExchangeRatesSnapshot({
        payload: {
          timestamp,
          base: "BRL",
          rates: { USD: 0.2 },
        },
        targetCurrency: "USD",
        now: new Date("2026-08-12T19:00:01.000Z"),
      }),
    /snapshot is stale/,
  );
});

test("Open Exchange Rates snapshot rejects wrong base, unsupported currency, and missing rates", () => {
  assert.throws(
    () =>
      normalizeOpenExchangeRatesSnapshot({
        payload: { timestamp, base: "USD", rates: { EUR: 0.9 } },
        targetCurrency: "EUR",
        now,
      }),
    /payload base must be BRL/,
  );

  assert.throws(
    () => buildOpenExchangeRatesRequest({ targetCurrencies: ["GBP"] }),
    /unsupported Open Exchange Rates target currency: GBP/,
  );

  assert.throws(
    () =>
      normalizeOpenExchangeRatesSnapshot({
        payload: { timestamp, base: "BRL", rates: {} },
        targetCurrency: "CNY",
        now,
      }),
    /rate missing for CNY/,
  );
});
