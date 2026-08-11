import { createDurableRepository } from "../../persistence-core/src/index.mjs";
import { assertBillingProvider, assertCheckoutSessionResult, normalizeBillingEvent } from "./provider.mjs";
import { assertBillingBinding, requireBillingCheckoutInput } from "./binding.mjs";
import { applyVerifiedBillingEvent } from "./lifecycle.mjs";

function assertRuntime(saasRuntime) {
  if (!saasRuntime || typeof saasRuntime !== "object") throw new TypeError(`saasRuntime must be an object`);
  for (const method of ["getTenant","getWorkspace","getSubscription","activateSubscription"]) {
    if (typeof saasRuntime[method] !== "function") throw new TypeError(`saasRuntime.${method} must be a function`);
  }
}

export function createSaasBillingRuntime({ store, saasRuntime, catalog, provider, clock = () => new Date().toISOString() } = {}) {
  if (!store || typeof store.read !== "function" || typeof store.executeIdempotent !== "function") {
    throw new TypeError("store must provide read and executeIdempotent");
  }
  assertRuntime(saasRuntime);
  if (!catalog || typeof catalog.get !== "function") throw new TypeError("catalog.get must be a function");
  assertBillingProvider(provider);

  const checkoutIntents = createDurableRepository({ store, collection: "saas.billingCheckoutIntents", idField: "checkoutIntentId" });
  const billingEvents = createDurableRepository({ store, collection: "saas.billingEvents", idField: "billingEventId" });
  const subscriptions = createDurableRepository({ store, collection: "saas.subscriptions", idField: "subscriptionId" });

  async function createCheckout(input = {}) {
    requireBillingCheckoutInput(input);
    const { checkoutIntentId, tenantId, workspaceId, subscriptionId, priceId, successUrl, cancelUrl } = input;
    const price = catalog.get(priceId);
    const [tenant, workspace, subscription] = await Promise.all([
      saasRuntime.getTenant(tenantId),
      saasRuntime.getWorkspace(workspaceId),
      saasRuntime.getSubscription(subscriptionId),
    ]);
    assertBillingBinding({ tenant, workspace, subscription, price });

    const existing = await checkoutIntents.getById(checkoutIntentId);
    if (existing) return existing;

    const providerResult = await provider.createCheckoutSession({
      checkoutIntentId, tenantId, workspaceId, subscriptionId, price, successUrl, cancelUrl,
    });
    assertCheckoutSessionResult(providerResult);

    const intent = Object.freeze({
      checkoutIntentId, tenantId, workspaceId, subscriptionId,
      productId: price.productId, planId: price.planId, priceId: price.priceId,
      currency: price.currency, interval: price.interval, amountMinor: price.amountMinor,
      taxBehavior: price.taxBehavior, provider: provider.name, providerMode: provider.mode,
      providerCheckoutId: providerResult.providerCheckoutId, checkoutUrl: providerResult.checkoutUrl,
      expiresAt: providerResult.expiresAt ?? null, createdAt: clock(),
    });
    await checkoutIntents.create(intent);
    return intent;
  }

  async function handleWebhook({ headers = {}, rawBody } = {}) {
    if (!(typeof rawBody === "string" || rawBody instanceof Uint8Array || Buffer.isBuffer(rawBody))) {
      throw new TypeError("rawBody must be the unmodified webhook payload");
    }
    const event = normalizeBillingEvent(await provider.verifyAndParseWebhook({ headers, rawBody }));
    const billingEventId = `${provider.name}:${event.eventId}`;

    const outcome = await store.executeIdempotent(`saas.billing:${billingEventId}`, async () => {
      const transition = await applyVerifiedBillingEvent({ event, saasRuntime, subscriptions });
      const record = Object.freeze({
        billingEventId, provider: provider.name, providerMode: provider.mode,
        eventId: event.eventId, eventType: event.eventType, subscriptionId: event.subscriptionId,
        providerSubscriptionId: event.providerSubscriptionId, providerCustomerId: event.providerCustomerId,
        occurredAt: event.occurredAt, processedAt: clock(), transition,
      });
      if (!(await billingEvents.getById(billingEventId))) await billingEvents.create(record);
      return record;
    });
    return outcome.result?.value ?? outcome.value ?? outcome.result ?? outcome;
  }

  return Object.freeze({
    createCheckout,
    handleWebhook,
    getCheckoutIntent: (id) => checkoutIntents.getById(id),
    getBillingEvent: (id) => billingEvents.getById(id),
  });
}
