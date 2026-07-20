import {
  OnboardingDomainError,
  requireText,
} from "./common.mjs";

export function requireRunningStep(snapshot, step) {
  if (snapshot.status !== "running" || snapshot.currentStep !== step) {
    throw new OnboardingDomainError(
      "invalid_onboarding_step",
      `onboarding is not running ${step} step`,
      { status: snapshot.status, currentStep: snapshot.currentStep },
    );
  }
}

export function createFoundationProgressOperations(ctx) {
  const { duplicate, current, mutable, append } = ctx;

  return {
    recordAccountConfirmed({ onboardingId, sourceEventId, accountId }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(onboardingId);
      mutable(previous);
      requireRunningStep(previous, "account");
      const normalized = requireText(accountId, "accountId");
      if (normalized !== previous.activation.accountId) {
        throw new OnboardingDomainError(
          "account_id_mismatch",
          "confirmed account does not match activation",
        );
      }
      return append(
        previous,
        sourceEventId,
        {
          account: { id: normalized, status: "confirmed" },
          currentStep: "workspace",
        },
        "onboarding.account.confirmed",
        { accountId: normalized },
      );
    },

    recordWorkspaceReady({
      onboardingId,
      sourceEventId,
      tenantId,
      projectId,
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(onboardingId);
      mutable(previous);
      requireRunningStep(previous, "workspace");
      if (previous.account?.status !== "confirmed") {
        throw new OnboardingDomainError(
          "account_not_confirmed",
          "workspace requires confirmed account",
        );
      }
      const workspace = {
        tenantId: requireText(tenantId, "tenantId"),
        projectId: requireText(projectId, "projectId"),
        status: "ready",
      };
      return append(
        previous,
        sourceEventId,
        { workspace, currentStep: "apikey" },
        "onboarding.workspace.ready",
        workspace,
      );
    },

    recordApiKeyReady({
      onboardingId,
      sourceEventId,
      apiKeyId,
      prefix,
      deliveryRecorded = false,
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(onboardingId);
      mutable(previous);
      requireRunningStep(previous, "apikey");
      if (previous.workspace?.status !== "ready") {
        throw new OnboardingDomainError(
          "workspace_not_ready",
          "API key requires ready workspace",
        );
      }
      const apiKey = {
        id: requireText(apiKeyId, "apiKeyId"),
        prefix: requireText(prefix, "prefix"),
        status: "ready",
        deliveryRecorded: deliveryRecorded === true,
      };
      return append(
        previous,
        sourceEventId,
        { apiKey, currentStep: "documentation" },
        "onboarding.apikey.ready",
        {
          apiKeyId: apiKey.id,
          prefix: apiKey.prefix,
          deliveryRecorded: apiKey.deliveryRecorded,
        },
      );
    },
  };
}
