const EVENT_TYPES = new Set(["checkout.completed", "payment.succeeded", "payment.failed", "subscription.cancelled"]);

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

export function assertBillingProvider(provider) {
  if (!provider || typeof provider !== "object") throw new TypeError("provider must be an object");
  requireText(provider.name, "provider.name");
  if (!["test", "live"].includes(provider.mode)) throw new TypeError("provider.mode must be test or live");
  if (typeof provider.createCheckoutSession !== "function") throw new TypeError("provider.createCheckoutSession must be a function");
  if (typeof provider.verifyAndParseWebhook !== "function") throw new TypeError("provider.verifyAndParseWebhook must be a function");
  return true;
}

export function assertCheckoutSessionResult(result) {
  if (!result || typeof result !== "object") throw new TypeError("checkout result must be an object");
  requireText(result.providerCheckoutId, "providerCheckoutId");
  const checkoutUrl = requireText(result.checkoutUrl, "checkoutUrl");
  const url = new URL(checkoutUrl);
  if (url.protocol !== "https:") throw new TypeError("checkoutUrl must use https");
  if (result.expiresAt != null && Number.isNaN(Date.parse(result.expiresAt))) throw new TypeError("expiresAt must be ISO-8601 or null");
  return true;
}

export function normalizeBillingEvent(event) {
  if (!event || typeof event !== "object") throw new TypeError("event must be an object");
  const eventId = requireText(event.eventId, "eventId");
  const eventType = requireText(event.eventType, "eventType");
  if (!EVENT_TYPES.has(eventType)) throw new TypeError("eventType is invalid");
  const subscriptionId = requireText(event.subscriptionId, "subscriptionId");
  const occurredAt = requireText(event.occurredAt, "occurredAt");
  if (Number.isNaN(Date.parse(occurredAt))) throw new TypeError("occurredAt must be ISO-8601");
  return Object.freeze({
    eventId,
    eventType,
    subscriptionId,
    occurredAt,
    providerSubscriptionId: event.providerSubscriptionId ? requireText(event.providerSubscriptionId, "providerSubscriptionId") : null,
    providerCustomerId: event.providerCustomerId ? requireText(event.providerCustomerId, "providerCustomerId") : null,
  });
}
