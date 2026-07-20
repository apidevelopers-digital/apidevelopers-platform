import {
  OnboardingDomainError,
  requireText,
} from "./common.mjs";

export function createRecoveryOperations(ctx) {
  const { duplicate, current, append, now } = ctx;

  return {
    failOnboarding({
      onboardingId,
      sourceEventId,
      code,
      message,
      retryable = true,
      step,
      at = now(),
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(onboardingId);
      ctx.mutable(previous);
      if (!["requested", "running", "failed"].includes(previous.status)) {
        throw new OnboardingDomainError(
          "invalid_onboarding_transition",
          "onboarding cannot fail from current status",
        );
      }
      const failure = {
        code: requireText(code, "code"),
        step: requireText(
          step ?? previous.currentStep ?? "account",
          "step",
        ),
        retryable: retryable === true,
        message: requireText(message, "message"),
      };
      return append(
        previous,
        sourceEventId,
        {
          status: "failed",
          currentStep: failure.step,
          failure,
          endedAt: at,
        },
        "onboarding.failed",
        {
          code: failure.code,
          step: failure.step,
          retryable: failure.retryable,
        },
      );
    },

    retryOnboarding({ onboardingId, sourceEventId }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(onboardingId);
      if (
        previous.status !== "failed" ||
        previous.failure?.retryable !== true
      ) {
        throw new OnboardingDomainError(
          "onboarding_not_retryable",
          "onboarding failure is not retryable",
        );
      }
      return append(
        previous,
        sourceEventId,
        {
          status: "running",
          attempt: previous.attempt + 1,
          currentStep: previous.failure.step,
          failure: null,
          endedAt: null,
        },
        "onboarding.retry.requested",
        {
          attempt: previous.attempt + 1,
          step: previous.failure.step,
        },
      );
    },

    cancelOnboarding({
      onboardingId,
      sourceEventId,
      reason = "requested",
      at = now(),
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(onboardingId);
      ctx.mutable(previous);
      return append(
        previous,
        sourceEventId,
        {
          status: "cancelled",
          currentStep: null,
          failure: null,
          endedAt: at,
        },
        "onboarding.cancelled",
        { reason: requireText(reason, "reason") },
      );
    },
  };
}
