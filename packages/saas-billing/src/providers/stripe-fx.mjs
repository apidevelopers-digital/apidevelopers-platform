import { createFxQuote } from "../fx.mjs";
import { assertLockedFxQuoteUsable } from "../fx-policy.mjs";

const ALLOWED_LOCK_DURATIONS = Object.freeze(["five_minutes", "hour", "day"]);

function requireObject(value, name) {
  if (!value || typeof value !== "object") throw new TypeError(`${name} must be an object`);
  return value;
}

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required`);
  return value.trim();
}

function normalizeCurrency(value, name) {
  const normalized = requireText(value, name).toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new TypeError(`${name} must be a 3-letter currency`);
  return normalized;
}

function unixSecondsToIso(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a unix timestamp`);
  return new Date(value * 1000).toISOString();
}

export function buildStripeFxQuoteRequest({
  presentmentCurrency,
  settlementCurrency = "BRL",
  lockDuration = "hour",
} = {}) {
  const presentment = normalizeCurrency(presentmentCurrency, "presentmentCurrency");
  const settlement = normalizeCurrency(settlementCurrency, "settlementCurrency");

  if (presentment === settlement) {
    throw new Error("presentment and settlement currencies must differ");
  }
  if (!ALLOWED_LOCK_DURATIONS.includes(lockDuration)) {
    throw new TypeError(`unsupported Stripe FX lock duration: ${lockDuration}`);
  }

  return Object.freeze({
    endpoint: "/v1/fx_quotes",
    params: Object.freeze({
      to_currency: settlement.toLowerCase(),
      from_currencies: Object.freeze([presentment.toLowerCase()]),
      lock_duration: lockDuration,
      usage: Object.freeze({ type: "payment" }),
    }),
  });
}

export function normalizeStripeFxQuote({
  stripeFxQuote,
  presentmentCurrency,
  settlementCurrency = "BRL",
  now = new Date(),
} = {}) {
  const raw = requireObject(stripeFxQuote, "stripeFxQuote");
  const presentment = normalizeCurrency(presentmentCurrency, "presentmentCurrency");
  const settlement = normalizeCurrency(settlementCurrency, "settlementCurrency");
  const providerQuoteId = requireText(raw.id, "stripeFxQuote.id");

  if (String(raw.to_currency ?? "").toUpperCase() !== settlement) {
    throw new Error(`Stripe FX quote settlement currency must be ${settlement}`);
  }
  if (raw.usage?.type !== "payment") {
    throw new Error("Stripe FX quote usage must be payment");
  }

  const lockExpiresAt = unixSecondsToIso(raw.lock_expires_at, "stripeFxQuote.lock_expires_at");
  assertLockedFxQuoteUsable({
    quoteId: providerQuoteId,
    lockStatus: raw.lock_status,
    lockExpiresAt,
    now,
  });

  const rateEntry = raw.rates?.[presentment.toLowerCase()];
  const baseRate = rateEntry?.rate_details?.base_rate;
  if (!(typeof baseRate === "number" || typeof baseRate === "string")) {
    throw new TypeError(`Stripe FX quote base_rate missing for ${presentment}`);
  }

  const createdAt = unixSecondsToIso(raw.created, "stripeFxQuote.created");
  const fxQuote = createFxQuote({
    baseCurrency: settlement,
    quoteCurrency: presentment,
    rate: String(baseRate),
    operation: "divide",
    asOf: createdAt,
    source: `stripe_fx_quotes:${providerQuoteId}`,
  });

  return Object.freeze({
    provider: "stripe",
    providerQuoteId,
    lockStatus: raw.lock_status,
    lockExpiresAt,
    fxQuote,
  });
}
