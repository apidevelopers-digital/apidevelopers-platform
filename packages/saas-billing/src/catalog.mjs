const INTERVALS = new Set(["month", "year"]);
const TAX_BEHAVIORS = new Set(["exclusive", "inclusive", "unspecified"]);

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function normalizeCurrency(value) {
  const currency = requireText(value, "currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError("currency must be an ISO-4217 style code");
  return currency;
}

export function createBillingPrice({ priceId, productId, planId, currency, interval, amountMinor, taxBehavior = "unspecified", active = true } = {}) {
  requireText(priceId, "priceId");
  requireText(productId, "productId");
  requireText(planId, "planId");
  const normalizedCurrency = normalizeCurrency(currency);
  if (!INTERVALS.has(interval)) throw new TypeError("interval is invalid");
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new TypeError("amountMinor must be a non-negative safe integer");
  if (!TAX_BEHAVIORS.has(taxBehavior)) throw new TypeError("taxBehavior is invalid");
  if (typeof active !== "boolean") throw new TypeError("active must be boolean");

  return Object.freeze({
    priceId: priceId.trim().toLowerCase(),
    productId: productId.trim().toLowerCase(),
    planId: planId.trim().toLowerCase(),
    currency: normalizedCurrency,
    interval,
    amountMinor,
    taxBehavior,
    active,
  });
}

export function createBillingCatalog(prices = []) {
  if (!Array.isArray(prices) || prices.length === 0) throw new TypeError("prices must be a non-empty array");
  const byId = new Map();
  for (const input of prices) {
    const price = createBillingPrice(input);
    if (byId.has(price.priceId)) throw new Error(`duplicate priceId: ${price.priceId}`);
    byId.set(price.priceId, price);
  }
  return Object.freeze({
    get(priceId) {
      const key = requireText(priceId, "priceId").toLowerCase();
      const price = byId.get(key);
      if (!price || !price.active) throw new Error("billing price not found or inactive");
      return price;
    },
    list() { return Object.freeze([...byId.values()]); },
  });
}
