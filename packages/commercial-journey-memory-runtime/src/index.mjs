import { createCheckoutService } from "@apidevelopers/checkout-core";
import { createCommercialJourney } from "@apidevelopers/commercial-journey-core";

const TEST_NOW = "2026-07-21T00:00:00.000Z";

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function nextId(prefix, state) {
  state.sequence += 1;
  return `${prefix}_test_${String(state.sequence).padStart(4, "0")}`;
}

export function createCommercialMemoryRuntime({ enabled = false } = {}) {
  const state = {
    sequence: 0,
    customers: new Map(),
    subscriptions: new Map(),
    workspaces: new Map(),
    keys: new Map(),
  };

  const checkout = createCheckoutService({
    idFactory: () => nextId("snap", state),
    clock: () => TEST_NOW,
  });

  const journey = createCommercialJourney({
    enabled,
    adapters: {
      async registerCustomer(context) {
        const customerId = nextId("cus", state);
        const customer = deepFreeze({
          customerId,
          email: context.input.email,
          status: "registered_test",
        });
        state.customers.set(customerId, customer);
        return { ok: true, value: customer };
      },

      async selectPlan(context) {
        return {
          ok: true,
          value: deepFreeze({
            planRef: context.input.requestedPlan ?? "developer_test",
            product: {
              id: "platform-core",
              version: 1,
              status: "READY_TO_SELL",
              planIds: ["developer_test"],
            },
            plan: {
              id: "developer_test",
              version: 1,
              productId: "platform-core",
              productVersion: 1,
              status: "ACTIVE",
              unitAmount: 0,
              currency: "BRL",
            },
          }),
        };
      },

      async createCheckoutSession(context) {
        const checkoutId = nextId("chk", state);
        const providerSessionId = nextId("provider_session", state);
        const result = checkout.createSession({
          checkoutId,
          accountId: context.registerCustomer.customerId,
          product: context.selectPlan.product,
          plan: context.selectPlan.plan,
          provider: "memory_test",
          providerSessionId,
          redirectUrl: "https://example.invalid/checkout-test",
          idempotencyKey: nextId("intent", state),
          sourceEventId: nextId("checkout_created", state),
          expiresAt: "2026-07-21T01:00:00.000Z",
        });
        return {
          ok: true,
          value: deepFreeze({
            checkoutId,
            providerSessionId,
            providerMode: "memory_test",
            snapshot: result.snapshot,
          }),
        };
      },

      async confirmPayment(context) {
        const { checkoutId, providerSessionId } = context.createCheckoutSession;
        const result = checkout.completeSession({
          checkoutId,
          sourceEventId: nextId("payment_confirmed", state),
          providerSessionId,
          paymentReference: nextId("pay", state),
          amount: context.selectPlan.plan.unitAmount,
          currency: context.selectPlan.plan.currency,
          completedAt: TEST_NOW,
        });
        return { ok: true, value: deepFreeze({ status: "confirmed_test", snapshot: result.snapshot }) };
      },

      async activateSubscription(context) {
        const subscriptionId = nextId("sub", state);
        const subscription = deepFreeze({
          subscriptionId,
          customerId: context.registerCustomer.customerId,
          planId: context.selectPlan.plan.id,
          status: "active_test",
        });
        state.subscriptions.set(subscriptionId, subscription);
        return { ok: true, value: subscription };
      },

      async provisionWorkspace(context) {
        const tenantId = nextId("tenant", state);
        const projectId = nextId("project", state);
        const workspace = deepFreeze({
          tenantId,
          projectId,
          subscriptionId: context.activateSubscription.subscriptionId,
          status: "provisioned_test",
        });
        state.workspaces.set(tenantId, workspace);
        return { ok: true, value: workspace };
      },

      async issueApiKey(context) {
        const keyId = nextId("key", state);
        const key = deepFreeze({
          keyId,
          projectId: context.provisionWorkspace.projectId,
          revealedOnce: true,
          radKey: `apid_test_${keyId.replaceAll("_", "")}`,
        });
        state.keys.set(keyId, key);
        return { ok: true, value: key };
      },

      async invokeFirstRequest(context) {
        if (!context.issueApiKey.revealedOnce) {
          return { ok: false, reason: "api_key_not_revealed" };
        }
        return {
          ok: true,
          value: deepFreeze({ status: 200, requestId: nextId("req", state), mode: "memory_test" }),
        };
      },
    },
  });

  return Object.freeze({
    execute: journey.execute,
    enabled,
    liveAllowed: false,
    deployAllowed: false,
    externalPublicationAllowed: false,
    paymentMode: "memory_test",
    checkoutContract: "@apidevelopers/checkout-core",
    stats() {
      return deepFreeze({
        customers: state.customers.size,
        subscriptions: state.subscriptions.size,
        workspaces: state.workspaces.size,
        keys: state.keys.size,
      });
    },
  });
}
