import {
  OnboardingDomainError,
  deepFreeze,
  requireText,
} from "./common.mjs";
import { createOnboardingSnapshot } from "./model.mjs";

export function createRequestOperations(ctx) {
  const { repository, idFactory, now, duplicate } = ctx;

  return {
    requestOnboarding({
      onboardingId,
      activationEvent,
      sourceEventId,
      metadata = {},
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      if (activationEvent?.type !== "activation.completed") {
        throw new OnboardingDomainError(
          "unsupported_activation_event",
          "onboarding requires activation.completed",
        );
      }
      const data = activationEvent.data ?? {};
      const activationId = requireText(
        activationEvent.activationId,
        "activationEvent.activationId",
      );
      const existing = repository.getCurrentByActivation(activationId);
      if (existing) {
        return deepFreeze({
          snapshot: existing,
          appended: false,
          duplicateOf: existing.snapshotId,
          events: [],
        });
      }

      const createdAt = now();
      const snapshot = createOnboardingSnapshot({
        snapshotId: requireText(idFactory(), "idFactory result"),
        onboardingId,
        revision: 1,
        activation: {
          id: activationId,
          accountId: activationEvent.accountId,
          checkoutId: activationEvent.checkoutId,
          subscriptionId: data.subscriptionId,
          provisioningId: data.provisioningId,
          completed: true,
        },
        status: "requested",
        attempt: 0,
        currentStep: "account",
        account: null,
        workspace: null,
        apiKey: null,
        documentation: null,
        firstTest: null,
        failure: null,
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
              type: "onboarding.requested",
              onboardingId: snapshot.onboardingId,
              activationId: snapshot.activation.id,
              accountId: snapshot.activation.accountId,
              occurredAt: createdAt,
              data: {
                checkoutId: snapshot.activation.checkoutId,
                subscriptionId: snapshot.activation.subscriptionId,
                provisioningId: snapshot.activation.provisioningId,
              },
            }]
          : [],
      });
    },

    startOnboarding({ onboardingId, sourceEventId }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = ctx.current(onboardingId);
      ctx.mutable(previous);
      if (previous.status !== "requested") {
        throw new OnboardingDomainError(
          "invalid_onboarding_transition",
          "only requested onboarding can start",
          { status: previous.status },
        );
      }
      return ctx.append(
        previous,
        sourceEventId,
        {
          status: "running",
          attempt: previous.attempt + 1,
          currentStep: "account",
          failure: null,
          endedAt: null,
        },
        "onboarding.started",
        { attempt: previous.attempt + 1 },
      );
    },
  };
}
