const MARKET_STATUS = Object.freeze({
  configuredTest: "configured_test",
  providerPending: "provider_pending",
});

const markets = [
  {
    marketId: "br",
    countries: ["BR"],
    currency: "BRL",
    provider: "mercadopago",
    providerCandidate: null,
    providerStatus: MARKET_STATUS.configuredTest,
  },
  {
    marketId: "us",
    countries: ["US"],
    currency: "USD",
    provider: null,
    providerCandidate: "stripe",
    providerStatus: MARKET_STATUS.providerPending,
  },
  {
    marketId: "eurozone",
    countries: ["AT", "BE", "DE", "ES", "FI", "FR", "GR", "IE", "IT", "LU", "NL", "PT"],
    currency: "EUR",
    provider: null,
    providerCandidate: "stripe",
    providerStatus: MARKET_STATUS.providerPending,
  },
  {
    marketId: "jp",
    countries: ["JP"],
    currency: "JPY",
    provider: null,
    providerCandidate: "stripe",
    providerStatus: MARKET_STATUS.providerPending,
  },
  {
    marketId: "kr",
    countries: ["KR"],
    currency: "KRW",
    provider: null,
    providerCandidate: "stripe",
    providerStatus: MARKET_STATUS.providerPending,
  },
  {
    marketId: "cn",
    countries: ["CN"],
    currency: "CNY",
    provider: null,
    providerCandidate: "stripe",
    providerStatus: MARKET_STATUS.providerPending,
  },
];

const byCountry = new Map();
for (const market of markets) {
  const frozen = Object.freeze({
    ...market,
    countries: Object.freeze([...market.countries]),
  });
  for (const countryCode of frozen.countries) {
    if (byCountry.has(countryCode)) throw new Error(`duplicate billing country: ${countryCode}`);
    byCountry.set(countryCode, frozen);
  }
}

export const BILLING_MARKETS_V1 = Object.freeze(
  markets.map((market) => byCountry.get(market.countries[0])),
);

export function resolveBillingMarket(countryCode) {
  if (typeof countryCode !== "string" || !countryCode.trim()) {
    throw new TypeError("billing countryCode is required");
  }
  const normalized = countryCode.trim().toUpperCase();
  const market = byCountry.get(normalized);
  if (!market) throw new Error(`billing market not configured for country: ${normalized}`);
  return market;
}

export function assertBillableMarket(countryCode) {
  const market = resolveBillingMarket(countryCode);
  if (!market.provider || market.providerStatus !== MARKET_STATUS.configuredTest) {
    throw new Error(`billing provider not configured for market: ${market.marketId}`);
  }
  return market;
}

export { MARKET_STATUS };
