import { createSubscription } from "../../contracts/src/saas-commercial.mjs";

export async function applyVerifiedBillingEvent({ event, saasRuntime, subscriptions }) {
  const subscription = await saasRuntime.getSubscription(event.subscriptionId);
  if (!subscription) throw new Error("billing event subscription not found");

  let transition = "recorded";
  if (event.eventType === "payment.succeeded") {
    if (subscription.status === "assisted_activation" || subscription.status === "trial") {
      await saasRuntime.activateSubscription({
        subscriptionId: event.subscriptionId,
        activatedAt: event.occurredAt,
      });
    } else if (subscription.status === "past_due" || subscription.status === "suspended") {
      await subscriptions.replace(createSubscription({
        ...subscription,
        status: "active",
        activatedAt: subscription.activatedAt ?? event.occurredAt,
      }));
    } else if (subscription.status !== "active") {
      throw new Error(`payment cannot activate subscription from ${subscription.status}`);
    }
    transition = "active";
  } else if (event.eventType === "payment.failed") {
    if (subscription.status === "active") {
      await subscriptions.replace(createSubscription({ ...subscription, status: "past_due" }));
      transition = "past_due";
    }
  } else if (event.eventType === "subscription.cancelled") {
    if (subscription.status !== "cancelled") {
      await subscriptions.replace(createSubscription({ ...subscription, status: "cancelled" }));
    }
    transition = "cancelled";
  }
  return transition;
}
