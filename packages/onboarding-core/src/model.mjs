import {
  OnboardingDomainError,
  assertNoSensitiveData,
  deepFreeze,
  requireIso,
  requireNonNegativeInteger,
  requirePositiveInteger,
  requireText,
} from "./common.mjs";
import {
  normalizeActivation,
  normalizeApiKey,
  normalizeDocumentation,
  normalizeFailure,
  normalizeFirstTest,
  normalizeRef,
  normalizeWorkspace,
} from "./model-normalizers.mjs";

export const ONBOARDING_STATUSES = Object.freeze([
  "requested",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const ONBOARDING_STEPS = Object.freeze([
  "account",
  "workspace",
  "apikey",
  "documentation",
  "first_test",
  "finalize",
]);

export function createOnboardingSnapshot(input) {
  const status = requireText(input.status, "status");
  if (!ONBOARDING_STATUSES.includes(status)) {
    throw new OnboardingDomainError(
      "invalid_onboarding_status",
      "onboarding status is not supported",
      { status },
    );
  }

  const currentStep =
    input.currentStep === null
      ? null
      : requireText(input.currentStep, "currentStep");
  if (currentStep !== null && !ONBOARDING_STEPS.includes(currentStep)) {
    throw new OnboardingDomainError(
      "invalid_onboarding_step",
      "onboarding step is not supported",
      { currentStep },
    );
  }

  const createdAt = requireIso(input.createdAt, "createdAt");
  const completedAt =
    input.completedAt === null ? null : requireIso(input.completedAt, "completedAt");
  const endedAt =
    input.endedAt === null ? null : requireIso(input.endedAt, "endedAt");

  if (
    status === "requested" &&
    (input.attempt !== 0 || currentStep !== "account")
  ) {
    throw new OnboardingDomainError(
      "invalid_requested_onboarding",
      "requested onboarding must start at account with attempt zero",
    );
  }
  if (status === "running" && currentStep === null) {
    throw new OnboardingDomainError(
      "missing_onboarding_step",
      "running onboarding requires currentStep",
    );
  }
  if (status === "completed" && (!completedAt || currentStep !== null)) {
    throw new OnboardingDomainError(
      "invalid_completed_onboarding",
      "completed onboarding requires completdAt and no currentStep",
   );
  }
  if (["failed", "cancelled"].includes(status) && !endedAt) {
    throw new OnboardingDomainError(
      "missing_ended_at",
      "failed and cancelled onboarding require endedAt",
   );
  }
  if (!["failed", "cancelled"].includes(status) && endedAt) {
    throw new OnboardingDomainError(
      "unexpected_ended_at",
      "non-terminal failure states cannot have endedAt",
   );
  }

  const metadata = input.metadata ?? {};
  assertNoSensitiveData(metadata);

  return deepFreeze({
    snapshotId: requireText(input.snapshotId, "snapshotId"),
    onboardingId: requireText(input.onboardingId, "onboardingId"),
    revision: requirePositiveInteger(input.revision, "revision"),
    activation: normalizeActivation(input.activation),
    status,
    attempt: requireNonNegativeInteger(input.attempt, "attempt"),
    currentStep,
    account: normalizeRef(input.account, "account", ["confirmed"]),
    workspace: normalizeWorkspace(input.workspace),
    apiKey: normalizeApiKey(input.apiKey),
    documentation: normalizeDocumentation(input.documentation),
    firstTest: normalizeFirstTest(input.firstTest),
    failure: normalizeFailure(input.failure),
    sourceEventId: requireText(input.sourceEventId, "sourceEventId"),
    previousSnapshotId:
      input.previousSnapshotId === null
        ? null
        : requireText(input.previousSnapshotId, "previousSnapshotId"),
    createdAt,
    completedAt,
    endedAt,
    metadata,
  });
}

export function isTerminalOnboarding(snapshot) {
  return ["completed", "cancelled"].includes(snapshot.status);
}
