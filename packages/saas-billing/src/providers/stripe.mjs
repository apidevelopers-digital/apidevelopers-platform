function requireObject(value, name) {
  if (!value || typeof value !== "object") throw new TypeError(`${name} must be an object`);
}
function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}
function idOf(value) {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && typeof value.id === "string") return value.id;
  return null;
}
function signatureHeader(headers) {
  if (typeof headers?.get === "function") return headers.get("stripe-signature");
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === "stripe-signature") return value;
  }
  return null;
}
function metadataFor(type, object) {
  if (type.startsWith("invoice.")) {
    return object?.parent?.subscription_details?.metadata
      ?? object?.lines?.data?.find((line) => line?.metadata?.apd_subscription_id)?.metadata
      ?? object?.metadata
      ?? {};
  }
  return object?.metadata ?? {};
}
function isoFromStripeEvent(event) {
  if (!Number.isFinite(event.created)) throw new TypeError("Stripe event.created must be a unix timestamp");
  return new Date(event.created * 1000).toISOString();
}
function normalizeStripeEvent(event) {
  requireObject(event, "Stripe event");
  const object = event?.data?.object;
  requireObject(object, "Stripe event.data.object");
  const metadata = metadataFor(event.type, object);
  const subscriptionId = requireText(metadata.apd_subscription_id, "Stripe metadata.apd_subscription_id");

  let eventType;
  if (event.type === "checkout.session.completed") eventType = "checkout.completed";
  else if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") eventType = "payment.succeeded";
  else if (event.type === "invoice.payment_failed") eventType = "payment.failed";
  else if (event.type === "customer.subscription.deleted") eventType = "subscription.cancelled";
  else throw new Error(`unsupported Stripe billing event: ${event.type}`);

  const providerSubscriptionId = event.type === "checkout.session.completed"
    ? idOf(object.subscription)
    : event.type.startsWith("customer.subscription.")
      ? idOf(object)
      : idOf(object?.parent?.subscription_details?.subscription)
        ?? idOf(object?.lines?.data?.find((line) => line?.parent?.subscription_item_details?.subscription)?.parent?.subscription_item_details?.subscription);

  return Object.freeze({
    eventId: requireText(event.id, "Stripe event.id"),
    eventType,
    subscriptionId,
    occurredAt: isoFromStripeEvent(event),
    providerSubscriptionId,
    providerCustomerId: idOf(object.customer),
  });
}

export function createStripeTestBillingProvider({ stripe, webhookSecret } = {}) {
  requireObject(stripe, "stripe");
  if (typeof stripe?.checkout?.sessions?.create !== "function") {
    throw new TypeError("stripe.checkout.sessions.create must be a function");
  }
  if (typeof stripe?.webhooks?.constructEvent !== "function") {
    throw new TypeError("stripe.webhooks.constructEvent must be a function");
  }
  requireText(webhookSecret, "webhookSecret");

  return Object.freeze({
    name: "stripe",
    mode: "test",
    async createCheckoutSession({ checkoutIntentId, tenantId, workspaceId, subscriptionId, price, successUrl, cancelUrl }) {
      const metadata = {
        apd_checkout_intent_id: checkoutIntentId,
        apd_tenant_id: tenantId,
        apd_workspace_id: workspaceId,
        apd_subscription_id: subscriptionId,
        apd_product_id: price.productId,
        apd_plan_id: price.planId,
        apd_price_id: price.priceId,
      };
      const priceData = {
        currency: price.currency.toLowerCase(),
        unit_amount: price.amountMinor,
        recurring: { interval: price.interval },
        product_data: {
          name: `${price.productId} ${price.planId}`,
          metadata: {
            apd_product_id: price.productId,
            apd_plan_id: price.planId,
          },
        },
      };
      if (price.taxBehavior !== "unspecified") priceData.tax_behavior = price.taxBehavior;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price_data: priceData, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: checkoutIntentId,
        metadata,
        subscription_data: { metadata },
      }, { idempotencyKey: checkoutIntentId });

      return Object.freeze({
        providerCheckoutId: requireText(session.id, "Stripe checkout session id"),
        checkoutUrl: requireText(session.url, "Stripe checkout session url"),
        expiresAt: Number.isFinite(session.expires_at)
          ? new Date(session.expires_at * 1000).toISOString()
          : null,
      });
    },
    async verifyAndParseWebhook({ headers = {}, rawBody }) {
      const signature = requireText(signatureHeader(headers), "Stripe-Signature");
      const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      return normalizeStripeEvent(event);
    },
  });
}
