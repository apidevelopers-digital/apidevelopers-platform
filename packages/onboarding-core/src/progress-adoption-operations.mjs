import {
  OnboardingDomainError,
  requireText,
} from "./common.mjs";
import { requireRunningStep } from "./progress-foundation-operations.mjs";

export function createAdoptionProgressOperations(ctx) {
  const { duplicate, current, mutable, append, now } = ctx;

  return {
    recordDocumentationOpened({
      onboardingId,
      sourceEventId,
      documentId,
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(onboardingId);
      mutable(previous);
      requireRunningStep(previous, "documentation");
      if (previous.apiKey?.status !== "ready") {
        throw new OnboardingDomainError(
          "apikey_not_ready",
          "documentation requires ready API key",
        );
      }
      const documentation = {
        documentId: requireText(documentId, "documentId"),
        status: "opened",
      };
      return append(
        previous,
        sourceEventId,
        { documentation, currentStep: "first_test" },
        "onboarding.documentation.opened",
        documentation,
      );
    },

    requestFirstTest({ onboardingId, sourceEventId, firstTestId }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(onboardingId);
      mutable(previous);
      requireRunningStep(previous, "first_test");
      if (previous.documentation?.status !== "opened") {
        throw new OnboardingDomainError(
          "documentation_not_opened",
          "first test requires opened documentation",
        );
      }
      const firstTest = {
        id: requireText(firstTestId, "firstTestId"),
        status: "requested",
        successful: false,
        usageEventId: null,
      };
      return append(
        previous,
        sourceEventId,
        { firstTest },
        "onboarding.first_test.requested",
        { firstTestId: firstTest.id },
      );
    },

    completeFirstTest({
      onboardingId,
      sourceEventId,
      firstTestId,
      usageEventId,
      successful,
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(onboardingId);
      mutable(previous);
      requireRunningStep(previous, "first_test");
      if (
        previous.firstTest?.status !== "requested" ||
        previous.firstTest.id !== requireText(firstTestId, "firstTestId")
      ) {
        throw new OnboardingDomainError(
          "first_test_not_requested",
          "matching first test must be requested before completion",
        );
      }
      const firstTest = {
        id: previous.firstTest.id,
        status: "completed",
        successful: successful === true,
        usageEventId: requireText(usageEventId, "usageEventId"),
      };
      return append(
        previous,
        sourceEventId,
        {
          firstTest,
          currentStep: successful === true ? "finalize" : "first_test",
        },
        "onboarding.first_test.completed",
        {
          firstTestId: firstTest.id,
          usageEventId: firstTest.usageEventId,
          successful: firstTest.successful,
        },
      );
    },

    completeOnboarding({
      onboardingId,
      sourceEventId,
      completedAt = now(),
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(onboardingId);
      mutable(previous);
      requireRunningStep(previous, "finalize");
      if (
        previous.account?.status !== "confirmed" ||
        previous.workspace?.status !== "ready" ||
        previous.apiKey?.status !== "ready" ||
        previous.documentation?.status !== "opened" ||
        previous.firstTest?.status !== "completed" ||
        previous.firstTest.successful !== true
      ) {
        throw new OnboardingDomainError(
          "incomplete_onboarding_requirements",
          "all onboarding requirements must be completed successfully",
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
        },
        "onboarding.completed",
        {
          tenantId: previous.workspace.tenantId,
          projectId: previous.workspace.projectId,
          apiKeyId: previous.apiKey.id,
          firstTestId: previous.firstTest.id,
          usageEventId: previous.firstTest.usageEventId,
        },
      );
    },
  };
}
