const ENVIRONMENTS = new Set(["test", "live"]);

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function requireCode(value, name, size) {
  const v = requireText(value, name).toUpperCase();
  if (!new RegExp(`^[A-Z]{${size}}$`).test(v)) throw new TypeError(`${name} must be ${size} uppercase letters`);
  return v;
}

function assertNoInlineSecrets(input, name) {
  const forbidden = [
    "accessToken", "access_token", "publicKey", "public_key", "webhookSecret", "webhook_secret",
    "clientSecret", "client_secret", "apiKey", "api_key", "password", "token",
  ];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(input, key)) throw new Error(`${name} must not contain inline secret field: ${key}`);
  }
}

export function defineLegalEntity(input = {}) {
  assertNoInlineSecrets(input, "legalEntity");
  return Object.freeze({
    legalEntityId: requireText(input.legalEntityId, "legalEntity.legalEntityId"),
    countryCode: requireCode(input.countryCode, "legalEntity.countryCode", 2),
    taxIdType: requireText(input.taxIdType, "legalEntity.taxIdType"),
    taxIdRef: requireText(input.taxIdRef, "legalEntity.taxIdRef"),
    fiscalProfileId: requireText(input.fiscalProfileId, "legalEntity.fiscalProfileId"),
    accountingCurrency: requireCode(input.accountingCurrency, "legalEntity.accountingCurrency", 3),
    status: input.status ?? "draft",
  });
}

export function defineMerchantAccount(input = {}) {
  assertNoInlineSecrets(input, "merchantAccount");
  const environment = requireText(input.environment, "merchantAccount.environment");
  if (!ENVIRONMENTS.has(environment)) throw new TypeError("merchantAccount.environment must be test or live");
  const webhookKey = requireText(input.webhookKey, "merchantAccount.webhookKey");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(webhookKey)) throw new TypeError("merchantAccount.webhookKey must be a safe public slug");
  return Object.freeze({
    merchantAccountId: requireText(input.merchantAccountId, "merchantAccount.merchantAccountId"),
    legalEntityId: requireText(input.legalEntityId, "merchantAccount.legalEntityId"),
    provider: requireText(input.provider, "merchantAccount.provider"),
    countryCode: requireCode(input.countryCode, "merchantAccount.countryCode", 2),
    currency: requireCode(input.currency, "merchantAccount.currency", 3),
    environment,
    credentialRef: requireText(input.credentialRef, "merchantAccount.credentialRef"),
    webhookSecretRef: requireText(input.webhookSecretRef, "merchantAccount.webhookSecretRef"),
    webhookKey,
    settlementAccountRef: input.settlementAccountRef ? requireText(input.settlementAccountRef, "merchantAccount.settlementAccountRef") : null,
    status: input.status ?? "draft",
  });
}

export function defineProductSellerBinding(input = {}) {
  assertNoInlineSecrets(input, "productSellerBinding");
  const countries = Array.isArray(input.countries) ? input.countries.map((v) => requireCode(v, "binding.country", 2)) : [];
  const currencies = Array.isArray(input.currencies) ? input.currencies.map((v) => requireCode(v, "binding.currency", 3)) : [];
  if (countries.length === 0) throw new TypeError("binding.countries must not be empty");
  if (currencies.length === 0) throw new TypeError("binding.currencies must not be empty");
  return Object.freeze({
    bindingId: requireText(input.bindingId, "binding.bindingId"),
    productId: requireText(input.productId, "binding.productId"),
    legalEntityId: requireText(input.legalEntityId, "binding.legalEntityId"),
    merchantAccountId: requireText(input.merchantAccountId, "binding.merchantAccountId"),
    fiscalProfileId: requireText(input.fiscalProfileId, "binding.fiscalProfileId"),
    countries: Object.freeze(countries),
    currencies: Object.freeze(currencies),
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveTo: input.effectiveTo ?? null,
    status: input.status ?? "draft",
  });
}

function isEffective(binding, at) {
  const t = at instanceof Date ? at.getTime() : new Date(at ?? Date.now()).getTime();
  if (!Number.isFinite(t)) throw new TypeError("at must be a valid date");
  if (binding.effectiveFrom && t < new Date(binding.effectiveFrom).getTime()) return false;
  if (binding.effectiveTo && t >= new Date(binding.effectiveTo).getTime()) return false;
  return true;
}

export function createFinancialControlRegistry({ legalEntities = [], merchantAccounts = [], bindings = [] } = {}) {
  const entities = new Map();
  const merchants = new Map();
  const sellerBindings = [];
  for (const raw of legalEntities) {
    const item = defineLegalEntity(raw);
    if (entities.has(item.legalEntityId)) throw new Error(`duplicate legalEntityId: ${item.legalEntityId}`);
    entities.set(item.legalEntityId, item);
  }
  for (const raw of merchantAccounts) {
    const item = defineMerchantAccount(raw);
    if (!entities.has(item.legalEntityId)) throw new Error(`unknown legalEntityId for merchant: ${item.legalEntityId}`);
    if (merchants.has(item.merchantAccountId)) throw new Error(`duplicate merchantAccountId: ${item.merchantAccountId}`);
    merchants.set(item.merchantAccountId, item);
  }
  for (const raw of bindings) {
    const item = defineProductSellerBinding(raw);
    if (!entities.has(item.legalEntityId)) throw new Error(`unknown legalEntityId for binding: ${item.legalEntityId}`);
    const merchant = merchants.get(item.merchantAccountId);
    if (!merchant) throw new Error(`unknown merchantAccountId for binding: ${item.merchantAccountId}`);
    if (merchant.legalEntityId !== item.legalEntityId) throw new Error(b"binding legal entity does not own merchant account");
    sellerBindings.push(item);
  }

  function resolveSeller({ productId, countryCode, currency, environment = "test", at } = {}) {
    const product = requireText(productId, "productId");
    const country = requireCode(countryCode, "countryCode", 2);
    const money = requireCode(currency, "currency", 3);
    const matches = sellerBindings.filter((binding) => {
      if (binding.status !== "active") return false;
      if (binding.productId !== product) return false;
      if (!binding.countries.includes(country) || !binding.currencies.includes(money)) return false;
      if (!isEffective(binding, at)) return false;
      const merchant = merchants.get(binding.merchantAccountId);
      return merchant?.status === "active" && merchant.environment === environment;
    });
    if (matches.length === 0) throw new Error("no active product seller binding");
    if (matches.length > 1) throw new Error("ambiguous product seller binding");
    const binding = matches[0];
    return Object.freeze({ binding, legalEntity: entities.get(binding.legalEntityId), merchantAccount: merchants.get(binding.merchantAccountId) });
  }

  return Object.freeze({ resolveSeller });
}

export function buildMerchantWebhookPath({ provider, webhookKey } = {}) {
  const p = requireText(provider, "provider").toLowerCase();
  const k = requireText(webhookKey, "webhookKey");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(p) || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(k)) throw new TypeError("unsafe webhook path segment");
  return `6v1/financial/webhooks/${p}/${k}`;
}

export function createFiscalDocumentRequest(input = {}) {
  assertNoInlineSecrets(input, "fiscalDocumentRequest");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0) throw new TypeError("amountMinor must be a non-negative safe integer");
  return Object.freeze({
    fiscalRequestId: requireText(input.fiscalRequestId, "fiscalRequestId"),
    idempotencyKey: requireText(input.idempotencyKey, "idempotencyKey"),
    legalEntityId: requireText(input.legalEntityId, "legalEntityId"),
    fiscalProfileId: requireText(input.fiscalProfileId, "fiscalProfileId"),
    sourceType: requireText(input.sourceType, "sourceType"),
    sourceId: requireText(input.sourceId, "sourceId"),
    customerRef: requireText(input.customerRef, "customerRef"),
    amountMinor: input.amountMinor,
    currency: requireCode(input.currency, "currency", 3),
    status: "pending",
  });
}
