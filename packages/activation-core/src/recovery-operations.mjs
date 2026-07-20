import {
  ActivationDomainError,
  requireText,
} from "./common.mjs";

function compensationPlan(snapshot) {
  const actions = [];
  if (snapshot.provisioning?.id) {
    actions.push({
      action: "cancel_provisioning",
      targetId: snapshot.provisioning.id,
      status: "pending",
    });
  }
  if (snapshot.subscription?.id) {
    actions.push({
      action: "cancel_subscription",
      targetId: snapshot.subscription.id,
      status: "pending",
    });
  }
  return actions;
}

export function createRecoveryOperations(ctx) {
  const { duplicate, current, mutable, append, now } = ctx;

  return {
    failActivation({
      activationId,
      sourceEventId,
      code,
      message,
      retryable = true,
      step,
      at = now(),
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(activationId);
      mutable(previous);
      if (!["requested", "running", "failed"].includes(previous.status)) {
        throw new ActivationDomainError(
          "invalid_activation_transition",
          "activation cannot fail from current status",
        );
      }
      const normalizedStep = requireText(
        step ?? previous.currentStep ?? "subscription",
        "step",
      );
      const failure = {
        code: requireText(code, "code"),
        step: normalizedStep,
        retryable: retryable === true,
        message: requireText(message, "message"),
      };
      return append(
        previous,
        sourceEventId,
        {
          status: "failed",
          currentStep: normalizedStep,
          failure,
          compensation: compensationPlan(previous),
          endedAt: at,
        },
        "activation.failed",
        {
          code: failure.code,
          step: failure.step,
          retryable: failure.retryable,
          compensation: compensationPlan(previous),
        },
      );
    },

    recordCompensation({
      activationId,
      sourceEventId,
      action,
      status,
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(activationId);
      if (previous.status !== "failed") {
        throw new ActivationDomainError(
          "activation_not_failed",
          "compensation requires failed activation",
        );
      }
      const normalizedAction = requireText(action, "action");
      const normalizedStatus = requireText(status, "status");
      if (!["completed", "failed"].includes(normalizedStatus)) {
        throw new ActivationDomainError(
          "invalid_compensation_status",
          "compensation status must be completed or failed",
        );
      }
      const found = previous.compensation.some(
        (item) => item.action === normalizedAction,
      );
      if (!found) {
        throw new ActivationDomainError(
          "compensation_not_found",
          "compensation action was not planned",
        );
      }
      const compensation = previous.compensation.map((item) =>
        item.action === normalizedAction
          ? { ...item, status: normalizedStatus }
          : item,
      );
      return append(
        previous,
        sourceEventId,
        { compensation },
        normalizedStatus === "completed"
          ? "activation.compensation.completed"
          : "activation.compensation.failed",
        { action: normalizedAction },
      );
    },

    retryActivation({ activationId, sourceEventId }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(activationId);
      if (previous.status !== "failed" || previous.failure?.retryable !== true) {
        throw new ActivationDomainError(
          "activation_not_retryable",
          "activation failure is not retryable",
        );
      }
      if (previous.compensation.some((item) => item.status !== "completed")) {
        throw new ActivationDomainError(
          "compensation_pending",
          "all compensations must complete before retry",
        );
      }
      return append(
        previous,
        sourceEventId,
        {
          status: "running",
          attempt: previous.attempt + 1,
          currentStep: "subscription",
          subscription: null,
          provisioning: null,
          failure: null,
          compensation: [],
          endedAt: null,
        },
        "activation.retry.requested",
        { attempt: previous.attempt + 1 },
      );
    },

    cancelActivation({
      activationId,
      sourceEventId,
      reason = "requested",
      at = now(),
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(activationId);
      ctx.mutable(previous);
      const compensation = compensationPlan(previous);
      return append(
        previous,
        sourceEventId,
        {
          status: "cancelled",
          currentStep: null,
          failure: null,
          compensation,
          endedAt: at,
        },
        "activation.cancelled",
        { reason: requireText(reason, "reason"), compensation },
      );
    },
  };
}
