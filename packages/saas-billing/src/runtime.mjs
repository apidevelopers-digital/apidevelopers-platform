import { createDurableRepository } from "../../persistence-core/src/index.mjs";
import { assertBillingProvider, assertCheckoutSessionResult, normalizeBillingEvent } from "./provider.mjs";
import { assertBillingBinding, requireBillingCheckoutInput } from "./binding.mjs";
import { transitionBillingSubscription } from "./lifecycle.mjs";

function assertRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") throw new TypeError("saasRuntime must be an object");
  for (const name of ["getTenant", "getWorkspace", "getSubscription"]) {
    if (typeof runtime[name] !== "function") throw new TypeError(`saasRuntime.${name} must be a function`);
  }
}

export function createSaasBillingRuntime({
  store,
  saasRuntime,
  catalog,
  provider,
  clock = () => new Date().toISOString(),
} = {}) {
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    throw new TypeError("store must provide read and transaction");
  }
  assertRuntime(saasRuntime);
  if (!catalog || typeof catalog.get !== "function") throw new TypeError("catalog.get must be a function");
  assertBillingProvider(provider);

  const intents = createDurableRepository({
    store,
    collection: "saas.billingCheckoutIntents",
    idField: "checkoutIntentId",
  });
  const events = createDurableRepository({
    store,
    collection: "saas.billingEvents",
    idField: "billingEventId",
  });

  async function createCheckout(input = {}) {
    requireBillingCheckoutInput(input);
    const {
      checkoutIntentId,
      tenantId,
      workspaceId,
      subscriptionId,
      priceId,
      successUrl,
      cancelUrl,
    } = input;
    const price = catalog.get(priceId);
    const [tenant, workspace, subscription] = await Promise.all([
      saasRuntime.getTenant(tenantId),
      saasRuntime.getWorkspace(workspaceId),
      saasRuntime.getSubscription(subscriptionId),
    ]);
    assertBillingBinding({ tenant, workspace, subscription, price });

    const existing = await intents.getById(checkoutIntentId);
    if (existing) return existing;

    const providerCheckout = await provider.createCheckoutSession({
      checkoutIntentId,
      tenantId,
      workspaceId,
      subscriptionId,
      price,
      successUrl,
      cancelUrl,
    });
    assertCheckoutSessionResult(providerCheckout);

    const intent = Object.freeze({
      checkoutIntentId,
      tenantId,
      workspaceId,
      subscriptionId,
      productId: price.productId,
      planId: price.planId,
      priceId: price.priceId,
      currency: price.currency,
      interval: price.interval,
      amountMinor: price.amountMinor,
      taxBehavior: price.taxBehavior,
      provider: provider.name,
      providerMode: provider.mode,
      providerCheckoutId: providerCheckout.providerCheckoutId,
      checkoutUrl: providerCheckout.checkoutUrl,
      expiresAt: providerCheckout.expiresAt ?? null,
      createdAt: clock(),
    });

    try {
      await intents.create(intent);
      return intent;
    } catch (error) {
      const concurrent = await intents.getById(checkoutIntentId);
      if (concurrent) return concurrent;
      throw error;
    }
  }

  async function handleWebhook({ headers = {}, rawBody, query = {} } = {}) {
    if (!(typeof rawBody === "string" || rawBody instanceof Uint8Array || Buffer.isBuffer(rawBody))) {
      throw new TypeError("rawBody must be the unmodified webhook payload");
    }
    const event = normalizeBillingEvent(
      await provider.verifyAndParseWebhook({ headers, rawBody, query }),
    );
    const billingEventId = `${provider.name}:${event.eventId}`;
    const key = `saas.billing:${billingEventId}`;

    const committed = await store.transaction(async (tx) => {
      const duplicate = tx.getIdempotency(key);
      if (duplicate) return { executed: false, value: duplicate.value };

      const subscription = tx.get("saas.subscriptions", event.subscriptionId);
      if (!subscription) throw new Error("billing event subscription not found");
      const lifecycle = transitionBillingSubscription(subscription, event);
      if (lifecycle.changed) {
        tx.put("saas.subscriptions", event.subscriptionId, lifecycle.next);
      }

      const record = Object.freeze({
        billingEventId,
        provider: provider.name,
        providerMode: provider.mode,
        eventId: event.eventId,
        eventType: event.eventType,
        subscriptionId: event.subscriptionId,
        providerSubscriptionId: event.providerSubscriptionId,
        providerCustomerId: event.providerCustomerId,
        occurredAt: event.occurredAt,
        processedAt: clock(),
        transition: lifecycle.transition,
      });
      if (!tx.get("saas.billingEvents", billingEventId)) {
        tx.put("saas.billingEvents", billingEventId, record, { ifAbsent: true });
      }
      tx.putIdempotency(key, record);
      return { executed: true, value: record };
    });

    const result = committed?.result ?? committed;
    return result?.value ?? result;
  }

  return Object.freeze({
    createCheckout,
    handleWebhook,
    getCheckoutIntent: (id) => intents.getById(id),
    getBillingEvent: (id) => events.getById(id),
  });
}
