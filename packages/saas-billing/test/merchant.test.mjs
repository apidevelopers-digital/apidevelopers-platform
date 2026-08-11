import assert from "node:assert/strict";
import test from "node:test";
import { createFinancialControl, createFiscalDocumentRequest, merchantWebhookPath } from "../src/merchant.mjs";

const legalEntities = [
  { legalEntityId: "apd-br", countryCode: "BR", accountingCurrency: "BRL", taxIdRef: "secret://apd/cnpj", fiscalProfileId: "fiscal-apd-br", status: "active" },
  { legalEntityId: "uni-br", countryCode: "BR", accountingCurrency: "BRL", taxIdRef: "secret://uni/cnpj", fiscalProfileId: "fiscal-uni-br", status: "active" },
];
const merchantAccounts = [
  { merchantAccountId: "mp-apd-br-test", legalEntityId: "apd-br", provider: "mercadopago", countryCode: "BR", currency: "BRL", environment: "test", credentialRef: "env://MP_APD_BR_ACCESS_TOKEN", webhookSecretRef: "env://MP_APD_BR_WEBHOOK_SECRET", webhookKey: "apd-br", status: "active" },
  { merchantAccountId: "mp-uni-br-test", legalEntityId: "uni-br", provider: "mercadopago", countryCode: "BR", currency: "BRL", environment: "test", credentialRef: "env://MP_UNI_BR_ACCESS_TOKEN", webhookSecretRef: "env://MP_UNI_BR_WEBHOOK_SECRET", webhookKey: "uni-br", status: "active" },
];

test("merchant webhook path is scoped by merchant, not product", () => {
  assert.equal(merchantWebhookPath("mercadopago", "apd-br"), "/v1/financial/webhooks/mercadopago/apd-br");
  assert.equal(merchantWebhookPath("mercadopago", "uni-br"), "/v1/financial/webhooks/mercadopago/uni-br");
});

test("seller resolution keeps legal entities separated", () => {
  const control = createFinancialControl({
    legalEntities,
    merchantAccounts,
    bindings: [
      { bindingId: "b1", productId: "product-apd", legalEntityId: "apd-br", merchantAccountId: "mp-apd-br-test", fiscalProfileId: "fiscal-apd-br", countries: ["BR"], currencies: ["BRL"], status: "active" },
      { bindingId: "b2", productId: "product-uni", legalEntityId: "uni-br", merchantAccountId: "mp-uni-br-test", fiscalProfileId: "fiscal-uni-br", countries: ["BR"], currencies: ["BRL"], status: "active" },
    ],
  });
  assert.equal(control.resolve({ productId: "product-apd", countryCode: "BR", currency: "BRL" }).merchantAccount.merchantAccountId, "mp-apd-br-test");
  assert.equal(control.resolve({ productId: "product-uni", countryCode: "BR", currency: "BRL" }).merchantAccount.merchantAccountId, "mp-uni-br-test");
  assert.throws(() => control.resolve({ productId: "unknown", countryCode: "BR", currency: "BRL" }), /no active/);
});

test("binding cannot use another legal entity merchant account", () => {
  assert.throws(() => createFinancialControl({
    legalEntities,
    merchantAccounts: [merchantAccounts[0]],
    bindings: [{ bindingId: "bad", productId: "x", legalEntityId: "uni-br", merchantAccountId: "mp-apd-br-test", fiscalProfileId: "fiscal-uni-br", countries: ["BR"], currencies: ["BRL"], status: "active" }],
  }), /does not own/);
});

test("inline provider secrets are forbidden", () => {
  assert.throws(() => createFinancialControl({
    legalEntities,
    merchantAccounts: [{ ...merchantAccounts[0], accessToken: "secret" }],
  }), /inline secret forbidden/);
});

test("fiscal request is provider-independent and idempotent-addressable", () => {
  const r = createFiscalDocumentRequest({
    fiscalRequestId: "fr_1",
    idempotencyKey: "payment:pay_1:fiscal:v1",
    legalEntityId: "apd-br",
    fiscalProfileId: "fiscal-apd-br",
    sourceType: "payment",
    sourceId: "pay_1",
    amountMinor: 9700,
    currency: "BRL",
  });
  assert.equal(r.status, "pending");
  assert.equal(r.amountMinor, 9700);
});
