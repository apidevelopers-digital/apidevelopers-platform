import {
  ActivationDomainError,
  deepFreeze,
  requireText,
} from "./common.mjs";
import { createActivationSnapshot } from "./model.mjs";

export function createRequestOperations(ctx) {
  const { repository, idFactory, now, duplicate } = ctx;

  return {
    requestActivation({
      activationId,
      checkoutEvent,
      sourceEventId,
      metadata = {},
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      if (checkoutEvent?.type !== "checkout.session.completed") {
        throw new ActivationDomainError(
          "unsupported_checkout_event",
          "activation requires checkout.session.completed",
        );
      }
      if (checkoutEvent.data?.confirmed !== true) {
        throw new ActivationDomainError(
          "checkout_not_confirmed",
          "checkout completion must be confirmed",
        );
      }

      const checkoutId = requireText(
        checkoutEvent.checkoutId,
        "checkoutEvent.checkoutId",
      );
      const existing = repository.getCurrentByCheckout(checkoutId);
      if (existing) {
        return deepFreeze({
          snapshot: existing,
          appended: false,
          duplicateOf: existing.snapshotId,
          events: [],
        });
      }

      const createdAt = now();
      const snapshot = createActivationSnapshot({
        snapshotId: requireText(idFactory(), "idFactory result"),
        activationId,
        revision: 1,
        checkout: {
          id: checkoutId,
          accountId: checkoutEvent.accountId,
          productId: checkoutEvent.data.productId,
          productVersion: checkoutEvent.data.productVersion,
          planId: checkoutEvent.data.planId,
          planVersion: checkoutEvent.data.planVersion,
          paymentReference: checkoutEvent.data.paymentReference,
          confirmed: checkoutEvent.data.confirmed,
        },
        status: "requested",
        attempt: 0,
        currentStep: "subscription",
        subscription: null,
        provisioning: null,
        failure: null,
        compensation: [],
        sourceEventId,
        previousSnapshotId: null,
        createdAt,
        completedAt: null,
        endedAt: null,
        metadata,
      });
      const stored = repository.append(snapshot);
      return deepFreeze({
        ...stored,
        events: stored.appended
          ? [{
              type: "activation.requested",
              activationId: snapshot.activationId,
              checkoutId: snapshot.checkout.id,
              accountId: snapshot.checkout.accountId,
              occurredAt: createdAt,
              data: {
                productId: snapshot.checkout.productId,
                productVersion: snapshot.checkout.productVersion,
                planId: snapshot.checkout.planId,
                planVersion: snapshot.checkout.planVersion,
                paymentReference: snapshot.checkout.paymentReference,
              },
            }]
          : [],
      });
    },

    startActivation({ activationId, sourceEventId }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = ctx.current(activationId);
      ctx.mutable(previous);
      if (previous.status !== "requested") {
        throw new ActivationDomainError(
          "invalid_activation_transition",
          "only requested activation can start",
          { status: previous.status },
        );
      }
      return ctx.append(
        previous,
        sourceEventId,
        {
          status: "running",
          attempt: previous.attempt + 1,
          currentStep: "subscription",
          failure: null,
          endedAt: null,
        },
        "activation.started",
        { attempt: previous.attempt + 1 },
      );
    },
  };
}
