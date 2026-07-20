import {
  ActivationDomainError,
  requireText,
} from "./common.mjs";

function requireRunningStep(snapshot, step) {
  if (snapshot.status !== "running" || snapshot.currentStep !== step) {
    throw new ActivationDomainError(
      "invalid_activation_step",
      `activation is not running ${step} step`,
      { status: snapshot.status, currentStep: snapshot.currentStep },
    );
  }
}

export function createProgressOperations(ctx) {
  const { duplicate, current, mutable, append, now } = ctx;

  return {
    recordSubscriptionActivated({
      activationId,
      sourceEventId,
      subscriptionId,
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(activationId);
      mutable(previous);
      requireRunningStep(previous, "subscription");
      const normalizedId = requireText(subscriptionId, "subscriptionId");
      return append(
        previous,
        sourceEventId,
        {
          subscription: { id: normalizedId, status: "active" },
          currentStep: "provisioning",
        },
        "activation.subscription.completed",
        { subscriptionId: normalizedId },
      );
    },

    recordProvisioningRequested({
      activationId,
      sourceEventId,
      provisioningId,
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(activationId);
      mutable(previous);
      requireRunningStep(previous, "provisioning");
      if (previous.subscription?.status !== "active") {
        throw new ActivationDomainError(
          "subscription_not_active",
          "provisioning requires active subscription",
        );
      }
      const normalizedId = requireText(provisioningId, "provisioningId");
      return append(
        previous,
        sourceEventId,
        {
          provisioning: { id: normalizedId, status: "requested" },
        },
        "activation.provisioning.requested",
        { provisioningId: normalizedId },
      );
    },

    recordProvisioningCompleted({
      activationId,
      sourceEventId,
      provisioningId,
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(activationId);
      mutable(previous);
      requireRunningStep(previous, "provisioning");
      const normalizedId = requireText(provisioningId, "provisioningId");
      if (previous.provisioning?.id !== normalizedId) {
        throw new ActivationDomainError(
          "provisioning_id_mismatch",
          "completed provisioning does not match activation",
        );
      }
      return append(
        previous,
        sourceEventId,
        {
          provisioning: { id: normalizedId, status: "completed" },
          currentStep: "finalize",
        },
        "activation.provisioning.completed",
        { provisioningId: normalizedId },
      );
    },

    completeActivation({ activationId, sourceEventId, completedAt = now() }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(activationId);
      mutable(previous);
      requireRunningStep(previous, "finalize");
      if (
        previous.subscription?.status !== "active" ||
        previous.provisioning?.status !== "completed"
      ) {
        throw new ActivationDomainError(
          "incomplete_activation_resources",
          "subscription and provisioning must be completed",
        );
      }
      return append(
        previous,
        sourceEventId,
        {
          status: "completed",
          currentStep: null,
          completedAt,
          failure: null,
          compensation: [],
        },
        "activation.completed",
        {
          subscriptionId: previous.subscription.id,
          provisioningId: previous.provisioning.id,
        },
      );
    },
  };
}
