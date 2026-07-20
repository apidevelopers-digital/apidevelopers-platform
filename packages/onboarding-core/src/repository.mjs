import {
  OnboardingDomainError,
  deepFreeze,
  requireText,
} from "./common.mjs";
import { createOnboardingSnapshot } from "./model.mjs";

export function createMemoryOnboardingRepository({ initialSnapshots = [] } = {}) {
  const bySnapshotId = new Map();
  const bySourceEventId = new Map();
  const histories = new Map();
  const byActivationId = new Map();

  function listHistory(onboardingId) {
    return (
      histories.get(requireText(onboardingId, "onboardingId")) ?? []
    ).map(deepFreeze);
  }

  function getCurrent(onboardingId) {
    return listHistory(onboardingId).at(-1) ?? null;
  }

  function append(input) {
    const snapshot = createOnboardingSnapshot(input);
    const duplicateId = bySourceEventId.get(snapshot.sourceEventId);
    if (duplicateId) {
      return deepFreeze({
        snapshot: bySnapshotId.get(duplicateId),
        appended: false,
        duplicateOf: duplicateId,
      });
    }
    if (bySnapshotId.has(snapshot.snapshotId)) {
      throw new OnboardingDomainError(
        "onboarding_snapshot_id_conflict",
        "snapshot id already exists",
      );
    }

    const history = histories.get(snapshot.onboardingId) ?? [];
    const expectedRevision = history.length + 1;
    if (snapshot.revision !== expectedRevision) {
      throw new OnboardingDomainError(
        "invalid_onboarding_revision",
        "onboarding revision must be sequential",
        { expectedRevision, revision: snapshot.revision },
      );
    }
    const previous = history.at(-1) ?? null;
    if (snapshot.revision === 1 && snapshot.previousSnapshotId !== null) {
      throw new OnboardingDomainError(
        "invalid_previous_snapshot",
        "first revision cannot reference previous snapshot",
      );
    }
    if (
      snapshot.revision > 1 &&
      snapshot.previousSnapshotId !== previous?.snapshotId
    ) {
      throw new OnboardingDomainError(
        "invalid_previous_snapshot",
        "previousSnapshotId does not match onboarding history",
      );
    }
    if (
      previous &&
      (previous.activation.id !== snapshot.activation.id ||
        previous.activation.accountId !== snapshot.activation.accountId ||
        previous.activation.checkoutId !== snapshot.activation.checkoutId ||
        previous.activation.subscriptionId !== snapshot.activation.subscriptionId ||
        previous.activation.provisioningId !== snapshot.activation.provisioningId)
    ) {
      throw new OnboardingDomainError(
        "onboarding_identity_conflict",
        "onboarding identity cannot change across revisions",
      );
    }

    if (snapshot.revision === 1) {
      const existingOnboardingId = byActivationId.get(snapshot.activation.id);
      if (existingOnboardingId) {
        const existing = getCurrent(existingOnboardingId);
        if (
          existing.activation.accountId !== snapshot.activation.accountId ||
          existing.activation.checkoutId !== snapshot.activation.checkoutId ||
          existing.activation.subscriptionId !== snapshot.activation.subscriptionId ||
          existing.activation.provisioningId !== snapshot.activation.provisioningId
        ) {
          throw new OnboardingDomainError(
            "activation_onboarding_conflict",
            "activation is already bound to another onboarding intent",
          );
        }
        return deepFreeze({
          snapshot: existing,
          appended: false,
          duplicateOf: existing.snapshotId,
        });
      }
      byActivationId.set(snapshot.activation.id, snapshot.onboardingId);
    }

    bySnapshotId.set(snapshot.snapshotId, snapshot);
    bySourceEventId.set(snapshot.sourceEventId, snapshot.snapshotId);
    history.push(snapshot);
    histories.set(snapshot.onboardingId, history);
    return deepFreeze({ snapshot, appended: true, duplicateOf: null });
  }

  initialSnapshots.forEach(append);

  return Object.freeze({
    kind: "memory",
    append,
    listHistory,
    getCurrent,
    getBySourceEventId(sourceEventId) {
      const snapshotId = bySourceEventId.get(
        requireText(sourceEventId, "sourceEventId"),
      );
      return snapshotId ? deepFreeze(bySnapshotId.get(snapshotId)) : null;
    },
    getCurrentByActivation(activationId) {
      const onboardingId = byActivationId.get(
        requireText(activationId, "activationId"),
      );
      return onboardingId ? getCurrent(onboardingId) : null;
    },
    listCurrentByAccount(accountId) {
      const normalized = requireText(accountId, "accountId");
      return [...histories.keys()]
        .map(getCurrent)
        .filter((item) => item?.activation.accountId === normalized)
        .sort((left, right) =>
          left.onboardingId.localeCompare(right.onboardingId),
        )
        .map(deepFreeze);
    },
  });
}
