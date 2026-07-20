import {
  createActivationService,
} from "../src/index.mjs";

export const T0 = "2026-07-20T00:00:00.000Z";
export const T1 = "2026-07-20T01:00:00.000Z";

export function checkoutEvent(patch = {}) {
  return {
    type: "checkout.session.completed",
    checkoutId: "checkout-1",
    accountId: "account-1",
    data: {
      productId: "platform-core",
      productVersion: 1,
      planId: "developer",
      planVersion: 1,
      paymentReference: "payment-1",
      confirmed: true,
      ...patch.data,
    },
    ...patch,
  };
}

export function service() {
  let id = 0;
  let tick = 0;
  return createActivationService({
    idFactory: () => `snap-${++id}`,
    clock: () =>
      new Date(Date.parse(T0) + tick++ * 1000).toISOString(),
  });
}

export function request(s, patch = {}) {
  return s.requestActivation({
    activationId: "activation-1",
    checkoutEvent: checkoutEvent(),
    sourceEventId: "checkout-completed-1",
    ...patch,
  });
}

export function start(s) {
  request(s);
  return s.startActivation({
    activationId: "activation-1",
    sourceEventId: "activation-start-1",
  });
}

export function subscription(s) {
  start(s);
  return s.recordSubscriptionActivated({
    activationId: "activation-1",
    sourceEventId: "subscription-active-1",
    subscriptionId: "subscription-1",
  });
}

export function provisioning(s) {
  subscription(s);
  s.recordProvisioningRequested({
    activationId: "activation-1",
    sourceEventId: "provisioning-requested-1",
    provisioningId: "provisioning-1",
  });
  return s.recordProvisioningCompleted({
    activationId: "activation-1",
    sourceEventId: "provisioning-completed-1",
    provisioningId: "provisioning-1",
  });
}
