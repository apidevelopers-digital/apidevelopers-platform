import { createSubscription } from "../../contracts/src/saas-commercial.mjs";

export function transitionBillingSubscription(subscription, event) {
  if (!subscription || typeof subscription !== "object") {
    throw new TypeError("subscription must be an object");
  }
  if (!event || typeof event !== "object") {
    throw new TypeError("event must be an object");
  }

  let next = subscription;
  let transition = "recorded";

  if (event.eventType === "payment.succeeded") {
    if (subscription.status === "assisted_activation" || subscription.status === "trial") {
      next = createSubscription({
        ...subscription,
        status: "active",
        activatedAt: event.occurredAt,
      });
    } else if (subscription.status === "past_due" || subscription.status === "suspended") {
      next = createSubscription({
        ...subscription,
        status: "active",
        activatedAt: subscription.activatedAt ?? event.occurredAt,
      });
    } else if (subscription.status !== "active") {
      throw new Error(`payment cannot activate subscription from ${subscription.status}`);
    }
    transition = "active";
  } else if (event.eventType === "payment.failed") {
    if (subscription.status === "active") {
      next = createSubscription({
        ...subscription,
        status: "past_due",
      });
      transition = "past_due";
    }
  } else if (event.eventType === "subscription.cancelled") {
    if (subscription.status !== "cancelled") {
      next = createSubscription({
        ...subscription,
        status: "cancelled",
      });
    }
    transition = "cancelled";
  }

  return Object.freeze({
    next,
    changed: next !== subscription,
    transition,
  });
}
