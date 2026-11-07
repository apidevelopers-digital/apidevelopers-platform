import { createFxQuote } from "../fx.mjs";

const TARGET_CURRENCIES = Object.freeze(["USD", "EUR", "JPY", "KRW", "CNY"]);
const DEFAULT_MAX_AGE_SECONDS = 60 * 60;
const MAX_FUTURE_SKEW_SECONDS = 5 * 60;

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
}

function normalizeCurrency(value, name) {
  const currency = requireText(value, name).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new TypeError(`${name} must be a 3-letter currency`);
  }
  return currency;
}

function parseNow(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("now must be a valid date/time");
  return date;
}

export const OPEN_EXCHANGE_RATES_CANDIDATE_V1 = Object.freeze({
  sourceId: "open_exchange_rates",
  status: "candidate_unconfigured",
  baseCurrency: "BRL",
  targetCurrencies: TARGET_CURRENCIES,
  updateCadenceSeconds: 60 * 60,
  maxAgeSeconds: DEFAULT_MAX_AGE_SECONDS,
  authentication: "external_app_id",
  financialAuthority: false,
});

export function buildOpenExchangeRatesRequest({
  baseCurrency = "BRL",
  targetCurrencies = TARGET_CURRENCIES,
} = {}) {
  const base = normalizeCurrency(baseCurrency, "baseCurrency");
  if (base !== "BRL") throw new Error("Open Exchange Rates candidate must use BRL base");

  if (!Array.isArray(targetCurrencies) || targetCurrencies.length === 0) {
    throw new TypeError("targetCurrencies must be a non-empty array");
  }

  const targets = targetCurrencies.map((currency) =>
    normalizeCurrency(currency, "targetCurrency"),
  );

  for (const currency of targets) {
    if (!TARGET_CURRENCIES.includes(currency)) {
      throw new Error(`unsupported Open Exchange Rates target currency: ${currency}`);
    }
  }

  return Object.freeze({
    endpoint: "/api/latest.json",
    params: Object.freeze({
      base: "BRL",
      symbols: [...new Set(targets)].join(","),
    }),
    authentication: "external_app_id",
  });
}

export function normalizeOpenExchangeRatesSnapshot({
  payload,
  targetCurrency,
  now = new Date(),
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
} = {}) {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("payload must be an object");
  }

  const base = normalizeCurrency(payload.base, "payload.base");
  if (base !== "BRL") throw new Error("Open Exchange Rates payload base must be BRL");

  const target = normalizeCurrency(targetCurrency, "targetCurrency");
  if (!TARGET_CURRENCIES.includes(target)) {
    throw new Error(`unsupported Open Exchange Rates target currency: ${target}`);
  }

  if (!Number.isSafeInteger(payload.timestamp) || payload.timestamp <= 0) {
    throw new TypeError("payload.timestamp must be a positive unix timestamp");
  }

  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new TypeError("maxAgeSeconds must be a positive integer");
  }

  const nowDate = parseNow(now);
  const publishedAtMs = payload.timestamp * 1000;
  const ageSeconds = Math.floor((nowDate.getTime() - publishedAtMs) / 1000);

  if (ageSeconds < -MAX_FUTURE_SKEW_SECONDS) {
    throw new Error("Open Exchange Rates snapshot timestamp is in the future");
  }
  if (ageSeconds > maxAgeSeconds) {
    throw new Error("Open Exchange Rates snapshot is stale");
  }

  const rawRate = payload.rates?.[target];
  if (!(typeof rawRate === "number" || typeof rawRate === "string")) {
    throw new TypeError(`Open Exchange Rates rate missing for ${target}`);
  }
  const numericRate = Number(rawRate);
  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    throw new TypeError(`Open Exchange Rates rate must be positive for ${target}`);
  }

  const asOf = new Date(publishedAtMs).toISOString();
  const fxQuote = createFxQuote({
    baseCurrency: "BRL",
    quoteCurrency: target,
    rate: String(rawRate),
    operation: "multiply",
    asOf,
    source: `open_exchange_rates:${payload.timestamp}`,
  });

  return Object.freeze({
    sourceId: "open_exchange_rates",
    sourceStatus: "candidate_unconfigured",
    financialAuthority: false,
    publishedAt: asOf,
    maxAgeSeconds,
    fxQuote,
  });
}
