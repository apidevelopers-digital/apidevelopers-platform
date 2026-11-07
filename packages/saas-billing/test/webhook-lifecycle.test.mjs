import test from "node:test";
import assert from "node:assert/strict";
import { withBilling, seedPending, ids, T1 } from "./helpers.mjs";

test("verified payment activates subscription and event replay is idempotent", async () => {
  await withBilling(async ({ saasRuntime, billing }) => {
    const x = await seedPending(saasRuntime);
    const first = await billing.handleWebhook({ headers:{"x-signature":"fixture"}, rawBody:'{"event":"paid"}' });
    assert.equal(first.transition, "active");
    assert.equal((await saasRuntime.getSubscription(x.subscriptionId)).status, "active");
    const second = await billing.handleWebhook({ headers:{"x-signature":"fixture"}, rawBody:'{"event":"paid"}' });
    assert.equal(second.eventId, first.eventId);
  }, { eventFactory: () => ({
    eventId:"evt-paid-1", eventType:"payment.succeeded", subscriptionId:ids().subscriptionId,
    occurredAt:T1, providerSubscriptionId:"sub-provider-1", providerCustomerId:"cus-provider-1",
  })});
});

test("failed signature cannot mutate subscription", async () => {
  await withBilling(async ({ saasRuntime, billing }) => {
    const x = await seedPending(saasRuntime);
    await assert.rejects(() => billing.handleWebhook({ headers:{}, rawBody:"{}" }), /signature verification failed/);
    assert.equal((await saasRuntime.getSubscription(x.subscriptionId)).status, "assisted_activation");
  });
});

test("failure, recovery and cancellation drive safe lifecycle states", async () => {
  let eventType = "payment.succeeded";
  let eventId = "evt-1";
  await withBilling(async ({ saasRuntime, billing }) => {
    const x = await seedPending(saasRuntime);
    await billing.handleWebhook({ rawBody:"{}" });
    assert.equal((await saasRuntime.getSubscription(x.subscriptionId)).status, "active");
    eventType="payment.failed"; eventId="evt-2";
    await billing.handleWebhook({ rawBody:"{}" });
    assert.equal((await saasRuntime.getSubscription(x.subscriptionId)).status, "past_due");
    eventType="payment.succeeded"; eventId="evt-3";
    await billing.handleWebhook({ rawBody:"{}" });
    assert.equal((await saasRuntime.getSubscription(x.subscriptionId)).status, "active");
    eventType="subscription.cancelled"; eventId="evt-4";
    await billing.handleWebhook({ rawBody: "{}" });
    assert.equal((await saasRuntime.getSubscription(x.subscriptionId)).status, "cancelled");
  }, {
    eventFactory: () => ({ eventId, eventType, subscriptionId:ids().subscriptionId, occurredAt:T1 })
  });
});
