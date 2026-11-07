const MINOR_UNIT_DIGITS = Object.freeze({
  BRL: 2,
  USD: 2,
  EUR: 2,
  JPY: 0,
  KRW: 0,
  CNY: 2,
});

const RATE_OPERATIONS = Object.freeze(["multiply", "divide"]);

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required`);
  return value.trim();
}

function normalizeCurrency(value) {
  const currency = requireText(value, "currency").toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(MINOR_UNIT_DIGITS, currency)) {
    throw new Error(`unsupported currency: ${currency}`);
  }
  return currency;
}

function pow10BigInt(digits) {
  return 10n ** BigInt(digits);
}

function parseDecimalRatio(value) {
  const text = requireText(value, "rate");
  if (!/^(?:0[.][0-9]+|[1-9][0-9]*(?:[.][0-9]+)?)$/.test(text)) {
    throw new TypeError("rate must be a positive decimal string");
  }
  const [integerPart, fractionPart = ""] = text.split(".");
  const numerator = BigInt(`${integerPart}${fractionPart}`);
  if (numerator <= 0n) throw new TypeError("rate must be greater than zero");
  return { numerator, denominator: pow10BigInt(fractionPart.length) };
}

function divideRoundHalfUp(numerator, denominator) {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

export const BASE_PRICE_CURRENCY = "BRL";

export function createFxQuote({
  baseCurrency = BASE_PRICE_CURRENCY,
  quoteCurrency,
  rate,
  operation = "multiply",
  asOf,
  source,
} = {}) {
  const base = normalizeCurrency(baseCurrency);
  const quote = normalizeCurrency(quoteCurrency);
  if (base === quote) throw new Error("fx quote must convert between different currencies");
  parseDecimalRatio(rate);

  if (!RATE_OPERATIONS.includes(operation)) {
    throw new TypeError(`unsupported FX rate operation: ${operation}`);
  }

  const normalizedAsOf = requireText(asOf, "asOf");
  if (Number.isNaN(Date.parse(normalizedAsOf))) {
    throw new TypeError("asOf must be a valid ISO date/time");
  }

  return Object.freeze({
    baseCurrency: base,
    quoteCurrency: quote,
    rate: rate.trim(),
    operation,
    asOf: normalizedAsOf,
    source: requireText(source, "source"),
  });
}

export function convertBasePriceMinor({ amountMinor, quote } = {}) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new TypeError("amountMinor must be a non-negative safe integer");
  }

  const validatedQuote = createFxQuote(quote);
  if (validatedQuote.baseCurrency !== BASE_PRICE_CURRENCY) {
    throw new Error(`base price currency must be ${BASE_PRICE_CURRENCY}`);
  }

  const { numerator: rateNumerator, denominator: rateDenominator } =
    parseDecimalRatio(validatedQuote.rate);
  const baseDigits = MINOR_UNIT_DIGITS[BASE_PRICE_CURRENCY];
  const targetDigits = MINOR_UNIT_DIGITS[validatedQuote.quoteCurrency];

  let numerator;
  let denominator;

  if (validatedQuote.operation === "multiply") {
    numerator =
      BigInt(amountMinor) *
      rateNumerator *
      pow10BigInt(targetDigits);
    denominator =
      pow10BigInt(baseDigits) *
      rateDenominator;
  } else {
    numerator =
      BigInt(amountMinor) *
      rateDenominator *
      pow10BigInt(targetDigits);
    denominator =
      pow10BigInt(baseDigits) *
      rateNumerator;
  }

  const converted = divideRoundHalfUp(numerator, denominator);

  if (converted > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("converted amount exceeds safe integer range");
  }

  return Object.freeze({
    amountMinor: Number(converted),
    currency: validatedQuote.quoteCurrency,
    fxQuote: validatedQuote,
    pricingModel: "direct_fx_conversion",
    marketUpliftBps: 0,
  });
}

export function getMinorUnitDigits(currency) {
  return MINOR_UNIT_DIGITS[normalizeCurrency(currency)];
}
