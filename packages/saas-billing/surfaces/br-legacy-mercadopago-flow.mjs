const HTTPS = "https://";

function requireHttps(value, name) {
  if (typeof value !== "string" || !value.startsWith(HTTPS)) {
    throw new TypeError(`${name} must be an https URL`);
  }
  return value;
}

const flow = {
  flowId: "site-uni-legacy-mercadopago",
  provider: "mercadopago",
  status: "reference_only",
  checkoutEnabled: false,
  migrationReady: false,
  publicBaseUrl: "https://sitedauni.com",
  subscribeUrl: "https://sitedauni.com/apps/assinar/",
  paymentStatusUrl: "https://sitedauni.com/apps/pagamento/",
  providerReturnUrl: "https://sitedauni.com/apps/pagamento/retorno.html",
  webhookUrl: "https://sitedauni.com/apps/api/payments.php?action=webhook",
  backUrlTemplates: Object.freeze({
    success: "https://sitedauni.com/apps/pagamento/?order={orderId}&status=success",
    pending: "https://sitedauni.com/apps/pagamento/?order={orderId}&status=pending",
    failure: "https://sitedauni.com/apps/pagamento/?order={orderId}&status=failure",
  }),
  blockingReasons: Object.freeze([
    "legacy_back_urls_use_success_pending_failure_semantics",
    "billing_core_subscription_adapter_currently_uses_a_single_back_url",
    "legacy_prices_are_not_authoritative_for_the_billing_core",
  ]),
};

for (const [name, value] of Object.entries({
  publicBaseUrl: flow.publicBaseUrl,
  subscribeUrl: flow.subscribeUrl,
  paymentStatusUrl: flow.paymentStatusUrl,
  providerReturnUrl: flow.providerReturnUrl,
  webhookUrl: flow.webhookUrl,
})) {
  requireHttps(value, name);
}

export const BR_LEGACY_MERCADOPAGO_FLOW = Object.freeze(flow);
