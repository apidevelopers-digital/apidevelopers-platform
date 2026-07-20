import {
  OnboardingDomainError,
  deepFreeze,
  requireIso,
  requireText,
} from "./common.mjs";
import {
  createOnboardingSnapshot,
  isTerminalOnboarding,
} from "./model.mjs";

export function createOnboardingContext({
  repository,
  idFactory,
  clock,
}) {
  if (typeof idFactory !== "function") {
    throw new OnboardingDomainError(
      "invalid_argument",
      "idFactory must be a function",
    );
  }

  const now = () => requireIso(clock(), "clock");
  const current = (onboardingId) => {
    const snapshot = repository.getCurrent(onboardingId);
    if (!snapshot) {
      throw new OnboardingDomainError(
        "onboarding_not_found",
        "onboarding was not found",
        { onboardingId },
      );
    }
    return snapshot;
  };
  const duplicate = (sourceEventId) => {
    const snapshot = repository.getBySourceEventId(sourceEventId);
    return snapshot
      ? deepFreeze({
          snapshot,
          appended: false,
          duplicateOf: snapshot.snapshotId,
          events: [],
        })
      : null;
  };
  const mutable = (snapshot) => {
    if (isTerminalOnboarding(snapshot)) {
      throw new OnboardingDomainError(
        "terminal_onboarding",
        "terminal onboarding cannot transition",
        { status: snapshot.status },
      );
    }
  };

  function append(previous, sourceEventId, patch, eventType, data = {}) {
    const at = now();
    const snapshot = createOnboardingSnapshot({
      ...previous,
      ...patch,
      snapshotId: requireText(idFactory(), "idFactory result"),
      revision: previous.revision + 1,
      previousSnapshotId: previous.snapshotId,
      sourceEventId,
      createdAt: at,
    });
    const stored = repository.append(snapshot);
    return deepFreeze({
      ...stored,
      events: stored.appended
        ? [{
            type: eventType,
            onboardingId: stored.snapshot.onboardingId,
            activationId: stored.snapshot.activation.id,
            accountId: stored.snapshot.activation.accountId,
            occurredAt: at,
            data,
          }]
        : [],
    });
  }

  return Object.freeze({
    repository,
    idFactory,
    now,
    current,
    duplicate,
    mutable,
    append,
  });
}
