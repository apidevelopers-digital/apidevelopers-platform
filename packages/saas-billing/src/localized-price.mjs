import { BASE_PRICE_CURRENCY, convertBasePriceMinor, createFxQuote } from "./fx.mjs";
import { resolveBillingMarket } from "./markets.mjs";

function requireBasePrice(basePrice) {
  if (!basePrice || typeof basePrice !== "object") {
    throw new TypeError("basePrice is required");
  }
  if (basePrice.currency !== BASE_PRICE_CURRENCY) {
    throw new Error(`base price currency must be ${BASE_PRICE_CURRENCY}`);
  }
  if (!Number.isSafeInteger(basePrice.amountMinor) || basePrice.amountMinor < 0) {
    throw new TypeError("basePrice.amountMinor must be a non-negative safe integer");
  }
  return basePrice;
}

export function deriveLocalizedPrice({
  basePrice,
  billingCountryCode,
  fxQuote = null,
} = {}) {
  const price = requireBasePrice(basePrice);
  const market = resolveBillingMarket(billingCountryCode);

  if (market.currency === BASE_PRICE_CURRENCY) {
    return Object.freeze({
      priceId: price.priceId ?? null,
      productId: price.productId ?? null,
      planId: price.planId ?? null,
      interval: price.interval ?? null,
      amountMinor: price.amountMinor,
      currency: BASE_PRICE_CURRENCY,
      baseAmountMinor: price.amountMinor,
      baseCurrency: BASE_PRICE_CURRENCY,
      marketId: market.marketId,
      billingCountryCode: billingCountryCode.trim().toUpperCase(),
      pricingModel: "base_catalog",
      fxQuote: null,
      active: price.active === true,
      provider: market.provider,
      providerStatus: market.providerStatus,
    });
  }

  if (!fxQuote || typeof fxQuote !== "object") {
    throw new Error(`FX quote is required for market: ${market.marketId}`);
  }

  const normalizedQuote = createFxQuote(fxQuote);
  if (normalizedQuote.baseCurrency !== BASE_PRICE_CURRENCY) {
    throw new Error(`FX quote base currency must be ${BASE_PRICE_CURRENCY}`);
  }
  if (normalizedQuote.quoteCurrency !== market.currency) {
    throw new Error(
      `FX quote currency ${normalizedQuote.quoteCurrency} does not match market currency ${market.currency}`,
    );
  }

  const converted = convertBasePriceMinor({
    amountMinor: price.amountMinor,
    quote: normalizedQuote,
  });

  return Object.freeze({
    priceId: price.priceId ?? null,
    productId: price.productId ?? null,
    planId: price.planId ?? null,
    interval: price.interval ?? null,
    amountMinor: converted.amountMinor,
    currency: converted.currency,
    baseAmountMinor: price.amountMinor,
    baseCurrency: BASE_PRICE_CURRENCY,
    marketId: market.marketId,
    billingCountryCode: billingCountryCode.trim().toUpperCase(),
    pricingModel: converted.pricingModel,
    marketUpliftBps: converted.marketUpliftBps,
    fxQuote: converted.fxQuote,
    active: price.active === true,
    provider: market.provider,
    providerCandidate: market.providerCandidate,
    providerStatus: market.providerStatus,
  });
}

export function deriveLocalizedPriceSet({
  basePrices,
  billingCountryCode,
  fxQuote = null,
} = {}) {
  if (!Array.isArray(basePrices) || basePrices.length === 0) {
    throw new TypeError("basePrices must be a non-empty array");
  }
  return Object.freeze(
    basePrices.map((basePrice) =>
      deriveLocalizedPrice({ basePrice, billingCountryCode, fxQuote }),
    ),
  );
}
