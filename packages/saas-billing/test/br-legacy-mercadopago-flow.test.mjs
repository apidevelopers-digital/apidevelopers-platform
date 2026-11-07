import assert from "node:assert/strict";
import test from "node:test";

import { BR_LEGACY_MERCADOPAGO_FLOW } from "../surfaces/br-legacy-mercadopago-flow.mjs";

test("legacy Mercado Pago flow is anchored as migration evidence only", () => {
  const flow = BR_LEGACY_MERCADOPAGO_FLOW;

  assert.equal(flow.provider, "mercadopago");
  assert.equal(flow.status, "reference_only");
  assert.equal(flow.checkoutEnabled, false);
  assert.equal(flow.migrationReady, false);
  assert.equal(flow.publicBaseUrl, "https://sitedauni.com");
  assert.equal(flow.subscribeUrl, "https://sitedauni.com/apps/assinar/");
  assert.equal(flow.paymentStatusUrl, "https://sitedauni.com/apps/pagamento/");
  assert.equal(flow.providerReturnUrl, "https://sitedauni.com/apps/pagamento/retorno.html");
  assert.equal(flow.webhookUrl, "https://sitedauni.com/apps/api/payments.php?action=webhook");
});

test("legacy back URL semantics stay explicit and are not collapsed into billing-core success/cancel semantics", () => {
  const flow = BR_LEGACY_MERCADOPAGO_FLOW;

  assert.deepEqual(Object.keys(flow.backUrlTemplates).sort(), ["failure", "pending", "success"]);
  assert.match(flow.backUrlTemplates.success, /status=success$/);
  assert.match(flow.backUrlTemplates.pending, /status=pending$/);
  assert.match(flow.backUrlTemplates.failure, /status=failure$/);
  assert.equal(flow.blockingReasons.includes("legacy_back_urls_use_success_pending_failure_semantics"), true);
  assert.equal(flow.blockingReasons.includes("billing_core_subscription_adapter_currently_uses_a_single_back_url"), true);
  assert.equal(flow.blockingReasons.includes("legacy_prices_are_not_authoritative_for_the_billing_core"), true);
});
