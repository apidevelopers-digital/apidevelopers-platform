import { createFinancialControl, merchantWebhookPath } from "../src/merchant.mjs";

export const BR_MAIN_TEST_LEGAL_ENTITY_ID = "legal-br-main";
export const BR_MAIN_TEST_MERCHANT_ACCOUNT_ID = "mercadopago-br-main-test";
export const BR_MAIN_TEST_WEBHOOK_KEY = "br-main";

const legalEntities = [
  {
    legalEntityId: BR_MAIN_TEST_LEGAL_ENTITY_ID,
    countryCode: "BR",
    accountingCurrency: "BRL",
    taxIdRef: "config://legal-br-main/cnpj",
    fiscalProfileId: "fiscal-br-saas-draft",
    status: "active",
  },
];

const merchantAccounts = [
  {
    merchantAccountId: BR_MAIN_TEST_MERCHANT_ACCOUNT_ID,
    legalEntityId: BR_MAIN_TEST_LEGAL_ENTITY_ID,
    provider: "mercadopago",
    countryCode: "BR",
    currency: "BRL",
    environment: "test",
    credentialRef: "env://MP_ACCESS_TOKEN",
    webhookSecretRef: "env://MP_WEBHOOK_SECRET",
    webhookKey: BR_MAIN_TEST_WEBHOOK_KEY,
    status: "active",
  },
];

const product = (bindingId, productId, businessUnitId, brandId) => ({
  bindingId,
  productId,
  legalEntityId: BR_MAIN_TEST_LEGAL_ENTITY_ID,
  merchantAccountId: BR_MAIN_TEST_MERCHANT_ACCOUNT_ID,
  businessUnitId,
  brandId,
  fiscalProfileId: "fiscal-br-saas-draft",
  countries: ["BR"],
  currencies: ["BRL"],
  status: "active",
});

const bindings = [
  product("br-main-test-unico", "uni.co", "apd", "uni.co"),
  product("br-main-test-imuni", "imuni", "uni", "imuni"),
  product("br-main-test-unijuri", "uni.juri", "uni", "uni.juri"),
  product("br-main-test-universo", "uni.verso", "uni", "uni.verso"),
  product("br-main-test-zuni", "zuni", "apd", "zuni"),
];

export const BR_MAIN_TEST_FINANCIAL_CONTROL = createFinancialControl({
  legalEntities,
  merchantAccounts,
  bindings,
});

export const BR_MAIN_TEST_WEBHOOK_PATH = merchantWebhookPath(
  "mercadopago",
  BR_MAIN_TEST_WEBHOOK_KEY,
);

export const BR_MAIN_TEST_BINDINGS = Object.freeze(bindings.map((item) => Object.freeze({ ...item })));
