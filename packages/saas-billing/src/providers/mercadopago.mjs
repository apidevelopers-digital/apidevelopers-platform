function requireObject(value, name) {
  if (!value || typeof value !== "object") {
    throw new TypeError(`${name} must be an object`);
  }
}

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function amountMajor(amountMinor) {
  return Number.parseFloat((amountMinor / 100).toFixed(2));
}

function mpStatusToEventType(status) {
  if (status === "authorized" || status === "active" || status === "approved") {
    return "payment.succeeded";
  }
  if (["cancelled", "canceled_by_user"].includes(status)) {
    return "subscription.cancelled";
  }
  if (["rejected", "paused", "past_due"].includes(status)) {
    return "payment.failed";
  }
  return "checkout.completed";
}

export function createMercadoPagoSubscriptionProvider({ client, mode = "test" } = {}) {
  requireObject(client, "client");
  if (!["test", "live"].includes(mode)) {
    throw new TypeError("mode must be test or live");
  }
  if (typeof client.createSubscriptionPlan !== "function") {
    throw new TypeError("client.createSubscriptionPlan must be a function");
  }
  if (typeof client.verifyAndParseWebhook !== "function") {
    throw new TypeError("client.verifyAndParseWebhook must be a function");
  }

  return Object.freeze({
    name: "mercadopago",
    mode,
    async createCheckoutSession({
      checkoutIntentId,
      tenantId,
      workspaceId,
      subscriptionId,
      price,
      successUrl,
    }) {
      const payload = {
        reason: `${price.productId} ${price.planId}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: price.interval === "year" ? "months" : "months",
          repetitions: price.interval === "year" ? 12 : undefined,
          transaction_amount: amountMajor(price.amountMinor),
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
      };

      const plan = await client.createSubscriptionPlan(payload, {
        idempotencyKey: checkoutIntentId,
      });
      return Object.freeze({
        providerCheckoutId: requireText(plan.id, "Mercado Pago plan id"),
        checkoutUrl: requireText(plan.init_point, "Mercado Pago init_point"),
        expiresAt: null,
      });
    },
    async verifyAndParseWebhook{(headers = {}, rawBody) {
      const event = await client.verifyAndParseWebhook({ headers, rawBody });
      requireObject(event, "Mercado Pago webhook event");
      return Object.freeze({
        eventId: requireText(event.id, "Mercado Pago event id"),
        eventType: mpStatusToEventType(event.status),
        subscriptionId: requireText(event.external_reference, "Mercado Pago external_reference"),
        occurredAt: requireText(event.occurredAt, "Mercado Pago occurredAt"),
        providerSubscriptionId: event.preapprovalId ?? null,
        providerCustomerId: event.payerId ?? null,
      });
    },
  });
}
