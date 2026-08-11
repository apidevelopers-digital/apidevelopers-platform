const obj = (value, name) => {
  if (!value || typeof value !== "object") throw new TypeError(`${name} must be an object`);
};

const text = (value, name) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
};

const major = (amountMinor) => Number.parseFloat((amountMinor / 100).toFixed(2));

const recurring = (interval) => interval === "month"
  ? { frequency: 1, frequency_type: "months" }
  : interval === "year"
    ? { frequency: 12, frequency_type: "months" }
    : (() => { throw new TypeError(`unsupported Mercado Pago interval: ${interval}`); })();

const eventType = (status) => status === "approved"
  ? "payment.succeeded"
  : status === "rejected"
    ? "payment.failed"
    : ["cancelled", "cancelled_by_user"].includes(status)
      ? "subscription.cancelled"
      : "checkout.completed";

const CHECKOUT_RETURN_POLICY = Object.freeze({
  kind: "single_back_url",
  backUrlSource: "successUrl",
  separateCancelUrlSupported: false,
});

export function createMercadoPagoSubscriptionProvider({ client, mode = "test" } = {}) {
  obj(client, "client");
  if (!["test", "live"].includes(mode)) throw new TypeError("mode must be test or live");
  if (typeof client.createSubscriptionPlan !== "function") throw new TypeError("client.createSubscriptionPlan must be a function");
  if (typeof client.verifyAndParseWebhook !== "function") throw new TypeError("client.verifyAndParseWebhook must be a function");

  return Object.freeze({
    name: "mercadopago",
    mode,
    checkoutReturnPolicy: CHECKOUT_RETURN_POLICY,

    async createCheckoutSession({
      checkoutIntentId,
      tenantId,
      workspaceId,
      subscriptionId,
      price,
      successUrl,
      cancelUrl,
    }) {
      if (cancelUrl && cancelUrl !== successUrl) {
        throw new Error("mercadopago_separate_cancel_url_not_supported");
      }

      const plan = await client.createSubscriptionPlan({
        reason: `${price.productId} ${price.planId}`,
        auto_recurring: {
          ...recurring(price.interval),
          transaction_amount: major(price.amountMinor),
          currency_id: price.currency,
        },
        back_url: successUrl,
        external_reference: subscriptionId,
        metadata: {
          apd_checkout_intent_id: checkoutIntentId,
          apd_tenant_id: tenantId,
          apd_workspace_id: workspaceId,
          apd_subscription_id: subscriptionId,
          apd_product_id: price.productId,
          apd_plan_id: price.planId,
          apd_price_id: price.priceId,
        },
      }, { idempotencyKey: checkoutIntentId });

      return Object.freeze({
        providerCheckoutId: text(plan.id, "Mercado Pago plan id"),
        checkoutUrl: text(plan.init_point, "Mercado Pago init_point"),
        expiresAt: null,
      });
    },

    async verifyAndParseWebhook({ headers = {}, rawBody, query = {} }) {
      const event = await client.verifyAndParseWebhook({ headers, rawBody, query });
      obj(event, "Mercado Pago webhook event");
      return Object.freeze({
        eventId: text(event.id, "Mercado Pago event id"),
        eventType: eventType(event.status),
        subscriptionId: text(event.external_reference, "Mercado Pago external_reference"),
        occurredAt: text(event.occurredAt, "Mercado Pago occurredAt"),
        providerSubscriptionId: event.preapprovalId ?? null,
        providerCustomerId: event.payerId ?? null,
      });
    },
  });
}
