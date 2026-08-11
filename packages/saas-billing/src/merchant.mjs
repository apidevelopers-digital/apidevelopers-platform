const slug = /^[a-z0-9][a-z0-9-]{1,62}$/;
const code = (v, n, len) => {
  if (typeof v !== "string" || !new RegExp(`^[A-Z]{${len}}$`).test(v)) throw new TypeError(`${n} invalid`);
  return v;
};
const text = (v, n) => {
  if (typeof v !== "string" || !v.trim()) throw new TypeError(`${n} required`);
  return v.trim();
};
const noSecrets = (o, n) => {
  const snake = (a, b) => `${a}_${b}`;
  for (const k of [
    "accessToken", snake("access", "token"),
    "publicKey", snake("public", "key"),
    "webhookSecret", snake("webhook", "secret"),
    "clientSecret", snake("client", "secret"),
    "apiKey", snake("api", "key"),
    "password", "token",
  ]) {
    if (Object.hasOwn(o, k)) throw new Error(`${n} inline secret forbidden: ${k}`);
  }
};
export function merchantWebhookPath(provider, webhookKey) {
  provider = text(provider, "provider").toLowerCase();
  webhookKey = text(webhookKey, "webhookKey");
  if (!slug.test(provider) || !slug.test(webhookKey)) throw new TypeError("unsafe webhook path");
  return `/v1/financial/webhooks/${provider}/${webhookKey}`;
}
export function createFinancialControl({ legalEntities = [], merchantAccounts = [], bindings = [] } = {}) {
  const e = new Map(), m = new Map();
  for (const x of legalEntities) {
    noSecrets(x, "legalEntity");
    const y = Object.freeze({
      legalEntityId: text(x.legalEntityId, "legalEntityId"),
      countryCode: code(x.countryCode, "countryCode", 2),
      accountingCurrency: code(x.accountingCurrency, "accountingCurrency", 3),
      taxIdRef: text(x.taxIdRef, "taxIdRef"),
      fiscalProfileId: text(x.fiscalProfileId, "fiscalProfileId"),
      status: x.status ?? "draft",
    });
    if (e.has(y.legalEntityId)) throw new Error("duplicate legal entity");
    e.set(y.legalEntityId, y);
  }
  for (const x of merchantAccounts) {
    noSecrets(x, "merchantAccount");
    if (!["test","live"].includes(x.environment)) throw new TypeError("environment invalid");
    if (!slug.test(x.webhookKey ?? "")) throw new TypeError("webhookKey invalid");
    const y = Object.freeze({
      merchantAccountId: text(x.merchantAccountId, "merchantAccountId"),
      legalEntityId: text(x.legalEntityId, "legalEntityId"),
      provider: text(x.provider, "provider"),
      countryCode: code(x.countryCode, "countryCode", 2),
      currency: code(x.currency, "currency", 3),
      environment: x.environment,
      credentialRef: text(x.credentialRef, "credentialRef"),
      webhookSecretRef: text(x.webhookSecretRef, "webhookSecretRef"),
      webhookKey: x.webhookKey,
      status: x.status ?? "draft",
    });
    if (!e.has(y.legalEntityId)) throw new Error("merchant legal entity missing");
    if (m.has(y.merchantAccountId)) throw new Error("duplicate merchant account");
    m.set(y.merchantAccountId, y);
  }
  const b = bindings.map((x) => {
    noSecrets(x, "binding");
    const merchant = m.get(x.merchantAccountId);
    if (!merchant) throw new Error("binding merchant missing");
    if (merchant.legalEntityId !== x.legalEntityId) throw new Error("binding legal entity does not own merchant");
    return Object.freeze({
      bindingId: text(x.bindingId, "bindingId"),
      productId: text(x.productId, "productId"),
      legalEntityId: text(x.legalEntityId, "legalEntityId"),
      merchantAccountId: text(x.merchantAccountId, "merchantAccountId"),
      fiscalProfileId: text(x.fiscalProfileId, "fiscalProfileId"),
      countries: Object.freeze((x.countries ?? []).map(v => code(v, "country", 2))),
      currencies: Object.freeze((x.currencies ?? []).map(v => code(v, "currency", 3))),
      status: x.status ?? "draft",
    });
  });
  return Object.freeze({
    resolve({ productId, countryCode, currency, environment = "test" }) {
      const hits = b.filter(x => x.status === "active" && x.productId === productId && x.countries.includes(countryCode) && x.currencies.includes(currency) && m.get(x.merchantAccountId)?.status === "active" && m.get(x.merchantAccountId)?.environment === environment);
      if (hits.length !== 1) throw new Error(hits.length ? "ambiguous product seller binding" : "no active product seller binding");
      const x = hits[0];
      return Object.freeze({ binding: x, legalEntity: e.get(x.legalEntityId), merchantAccount: m.get(x.merchantAccountId) });
    },
  });
}
export function createFiscalDocumentRequest(x = {}) {
  noSecrets(x, "fiscalDocumentRequest");
  if (!Number.isSafeInteger(x.amountMinor) || x.amountMinor < 0) throw new TypeError("amountMinor invalid");
  return Object.freeze({
    fiscalRequestId: text(x.fiscalRequestId, "fiscalRequestId"),
    idempotencyKey: text(x.idempotencyKey, "idempotencyKey"),
    legalEntityId: text(x.legalEntityId, "legalEntityId"),
    fiscalProfileId: text(x.fiscalProfileId, "fiscalProfileId"),
    sourceType: text(x.sourceType, "sourceType"),
    sourceId: text(x.sourceId, "sourceId"),
    amountMinor: x.amountMinor,
    currency: code(x.currency, "currency", 3),
    status: "pending",
  });
}
