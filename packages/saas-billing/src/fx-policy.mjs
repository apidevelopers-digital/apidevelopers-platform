const SUPPORTED_LOCAL_CURRENCIES = Object.freeze(["USD", "EUR", "JPY", "KRW", "CNY"]);

export const FX_SOURCE_POLICY_V1 = Object.freeze({
  baseCurrency: "BRL",
  pricingModel: "direct_fx_conversion",
  marketUpliftBps: 0,
  transactionalSource: Object.freeze({
    providerCandidate: "stripe",
    capability: "fx_quotes",
    status: "provider_pending",
    lockDuration: "hour",
    usageType: "payment",
    customerPricingRateField: "base_rate",
    feeTreatment: "merchant_absorbed",
    quoteDirection: "local_presentment_to_brl_settlement",
  }),
  fallback: Object.freeze({
    mode: "fail_closed",
    allowStaleQuote: false,
  }),
  referenceOnlySources: Object.freeze(["bcb_ptax", "ecb_reference_rates"]),
  supportedLocalCurrencies: SUPPORTED_LOCAL_CURRENCIES,
});

export function getFxSourcePolicy({ targetCurrency } = {}) {
  if (typeof targetCurrency !== "string" || !targetCurrency.trim()) {
    throw new TypeError("targetCurrency is required");
  }

  const currency = targetCurrency.trim().toUpperCase();
  if (currency === FX_SOURCE_POLICY_V1.baseCurrency) {
    return Object.freeze({
      required: false,
      source: null,
      lockDuration: null,
      currency,
    });
  }

  if (!SUPPORTED_LOCAL_CURRENCIES.includes(currency)) {
    throw new Error(`unsupported FX target currency: ${currency}`);
  }

  return Object.freeze({
    required: true,
    source: "stripe_fx_quotes",
    providerCandidate: FX_SOURCE_POLICY_V1.transactionalSource.providerCandidate,
    providerStatus: FX_SOURCE_POLICY_V1.transactionalSource.status,
    lockDuration: FX_SOURCE_POLICY_V1.transactionalSource.lockDuration,
    usageType: FX_SOURCE_POLICY_V1.transactionalSource.usageType,
    customerPricingRateField: FX_SOURCE_POLICY_V1.transactionalSource.customerPricingRateField,
    feeTreatment: FX_SOURCE_POLICY_V1.transactionalSource.feeTreatment,
    currency,
  });
}

export function assertLockedFxQuoteUsable({
  quoteId,
  lockStatus,
  lockExpiresAt,
  now = new Date(),
} = {}) {
  if (typeof quoteId !== "string" || !quoteId.trim()) {
    throw new TypeError("quoteId is required");
  }
  if (lockStatus !== "active") {
    throw new Error(`FX quote is not active: ${lockStatus ?? "unknown"}`);
  }

  const expiresMs = Date.parse(lockExpiresAt);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(expiresMs) || !Number.isFinite(nowMs)) {
    throw new TypeError("lockExpiresAt and now must be valid date/time values");
  }
  if (expiresMs <= nowMs) {
    throw new Error("FX quote is expired");
  }

  return true;
}
