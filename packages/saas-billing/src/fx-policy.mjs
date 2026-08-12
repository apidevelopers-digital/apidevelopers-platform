const CURRENCIES=Object.freeze(["USD","EUR","JPY","KRW","CNY"]);

export const FX_SOURCE_POLICY_V1=Object.freeze({
  baseCurrency:"BRL",
  pricingModel:"direct_fx_conversion",
  marketUpliftBps:0,
  transactionalSource:Object.freeze({
    providerCandidate:null,
    status:"pending",
    feeTreatment:"merchant_absorbed",
  }),
  experimentalSources:Object.freeze([Object.freeze({
    providerCandidate:"stripe",
    capability:"fx_quotes",
    status:"blocked_for_br_merchant_preview",
    reasonCode:"merchant_country_not_supported_in_preview",
    lockDuration:"hour",
    usageType:"payment",
    customerPricingRateField:"base_rate",
    feeTreatment:"merchant_absorbed",
    quoteDirection:"local_presentment_to_brl_settlement",
  })]),
  referenceOnlySources:Object.freeze(["bcb_ptax","ecb_reference_rates"]),
  referenceCoverage:Object.freeze({
    bcb_ptax:Object.freeze(["USD","EUR","JPY"]),
    ecb_reference_rates:Object.freeze(["BRL","USD","EUR","JPY","KRW","CNY"]),
  }),
  fallback:Object.freeze({mode:"fail_closed",allowStaleQuote:false}),
  supportedLocalCurrencies:CURRENCIES,
});

export function getFxSourcePolicy({targetCurrency}={}){
  if(typeof targetCurrency!=="string"||!targetCurrency.trim())throw new TypeError("targetCurrency is required");
  const currency=targetCurrency.trim().toUpperCase();
  if(currency===FX_SOURCE_POLICY_V1.baseCurrency)return Object.freeze({required:false,source:null,lockDuration:null,currency});
  if(!CURRENCIES.includes(currency))throw new Error(`unsupported FX target currency: ${currency}`);
  return Object.freeze({
    required:true,
    source:null,
    providerCandidate:null,
    providerStatus:"pending",
    lockDuration:null,
    customerPricingRateField:null,
    feeTreatment:"merchant_absorbed",
    currency,
    failClosed:true,
  });
}

export function assertLockedFxQuoteUsable({quoteId,lockStatus,lockExpiresAt,now=new Date()}={}){
  if(typeof quoteId!=="string"||!quoteId.trim())throw new TypeError("quoteId is required");
  if(lockStatus!=="active")throw new Error(`FX quote is not active: ${lockStatus??"unknown"}`);
  const expiresMs=Date.parse(lockExpiresAt);
  const nowMs=now instanceof Date?now.getTime():Date.parse(now);
  if(!Number.isFinite(expiresMs)||!Number.isFinite(nowMs))throw new TypeError("lockExpiresAt and now must be valid date/time values");
  if(expiresMs<=nowMs)throw new Error("FX quote is expired");
  return true;
}
