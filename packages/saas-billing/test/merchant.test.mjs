import assert from "node:assert/strict";
import test from "node:test";
import {
  createFinancialControl,
  createFiscalDocumentRequest,
  merchantWebhookPath,
} from "../src/merchant.mjs";

const legalEntities = [
  {
    legalEntityId: "legal-br-main",
    countryCode: "BR",
    accountingCurrency: "BRL",
    taxIdRef: "secret://legal-br-main/cnpj",
    fiscalProfileId: "fiscal-br-main",
    status: "active",
  },
];

const merchantAccounts = [
  {
    merchantAccountId: "mp-br-main-test",
    legalEntityId: "legal-br-main",
    provider: "mercadopago",
    countryCode: "BR",
    currency: "BRL",
    environment: "test",
    credentialRef: "env://MP_ACCESS_TOKEN",
    webhookSecretRef: "env://MP_WEBHOOK_SECRET",
    webhookKey: "br-main",
    status: "active",
  },
];

const bindings = [
  {
    bindingId: "b-apd-zuni",
    productId: "zuni",
    legalEntityId: "legal-br-main",
    merchantAccountId: "mp-br-main-test",
    businessUnitId: "apd",
    brandId: "zuni",
    fiscalProfileId: "fiscal-zuni-br",
    countries: ["BR"],
    currencies: ["BRL"],
    status: "active",
  },
  {
    bindingId: "b-uni-imuni",
    productId: "imuni",
    legalEntityId: "legal-br-main",
    merchantAccountId: "mp-br-main-test",
    businessUnitId: "uni",
    brandId: "imuni",
    fiscalProfileId: "fiscal-imuni-br",
    countries: ["BR"],
    currencies: ["BRL"],
    status: "active",
  },
];

test("one Brazilian legal entity can serve APD and uni business units", () => {
  const control = createFinancialControl({ legalEntities, merchantAccounts, bindings });
  const apd = control.resolve({ productId: "zuni", countryCode: "BR", currency: "BRL" });
  const uni = control.resolve({ productId: "imuni", countryCode: "BR", currency: "BRL" });

  assert.equal(apd.legalEntity.legalEntityId, "legal-br-main");
  assert.equal(uni.legalEntity.legalEntityId, "legal-br-main");
  assert.equal(apd.merchantAccount.merchantAccountId, "mp-br-main-test");
  assert.equal(uni.merchantAccount.merchantAccountId, "mp-br-main-test");
  assert.equal(apd.binding.businessUnitId, "apd");
  assert.equal(uni.binding.businessUnitId, "uni");
});

test("merchant webhook is application-scoped, not product-scoped", () => {
  assert.equal(
    merchantWebhookPath("mercadopago", "br-main"),
    "/v1/financial/webhooks/mercadopago/br-main",
  );
});

test("seller resolution remains fail closed", () => {
  const control = createFinancialControl({ legalEntities, merchantAccounts, bindings });
  assert.throws(
    () => control.resolve({ productId: "unknown", countryCode: "BR", currency: "BRL" }),
    /no active/,
  );
});

test("binding requires business unit and brand", () => {
  assert.throws(
    () => createFinancialControl({
      legalEntities,
      merchantAccounts
    ,bindings: [{ ...bindings[0], businessUnitId: "" }],
    }),
    /businessUnitId required/,
  );
});

test("inline provider secrets remain forbidden", () => {
  assert.throws(
    () => createFinancialControl({
      legalEntities,
      merchantAccounts: [{ ...merchantAccounts[0], accessToken: "secret" }],
    }),
    /inline secret forbidden/,
  );
});

test("fiscal request preserves legal entity, business unit and product", () => {
  const r = createFiscalDocumentRequest({
    fiscalRequestId: "fr_1",
    idempotencyKey: "payment:pay_1:fiscal:v1",
    legalEntityId: "legal-br-main",
    businessUnitId: "uni",
    productId: "imuni",
    fiscalProfileId: "fiscal-imuni-br",
    sourceType: "payment",
    sourceId: "pay_1",
    amountMinor: 9900,
    currency: "BRL",
  });

  assert.equal(r.legalEntityId, "legal-br-main");
  assert.equal(r.businessUnitId, "uni");
  assert.equal(r.productId, "imuni");
  assert.equal(r.status, "pending");
});
