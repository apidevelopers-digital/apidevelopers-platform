import {
  ActivationDomainError,
  deepFreeze,
  requireText,
} from "./common.mjs";
import { createActivationSnapshot } from "./model.mjs";

export function createMemoryActivationRepository({ initialSnapshots = [] } = {}) {
  const bySnapshotId = new Map();
  const bySourceEventId = new Map();
  const histories = new Map();
  const byCheckoutId = new Map();

  function append(input) {
    const snapshot = createActivationSnapshot(input);
    const duplicateId = bySourceEventId.get(snapshot.sourceEventId);
    if (duplicateId) {
      return deepFreeze({
        snapshot: bySnapshotId.get(duplicateId),
        appended: false,
        duplicateOf: duplicateId,
      });
    }
    if (bySnapshotId.has(snapshot.snapshotId)) {
      throw new ActivationDomainError(
        "activation_snapshot_id_conflict",
        "snapshot id already exists",
      );
    }

    const history = histories.get(snapshot.activationId) ?? [];
    const expectedRevision = history.length + 1;
    if (snapshot.revision !== expectedRevision) {
      throw new ActivationDomainError(
        "invalid_activation_revision",
        "activation revision must be sequential",
        { expectedRevision, revision: snapshot.revision },
      );
    }
    const previous = history.at(-1) ?? null;
    if (snapshot.revision === 1 && snapshot.previousSnapshotId !== null) {
      throw new ActivationDomainError(
        "invalid_previous_snapshot",
        "first revision cannot reference previous snapshot",
      );
    }
    if (
      snapshot.revision > 1 &&
      snapshot.previousSnapshotId !== previous?.snapshotId
    ) {
      throw new ActivationDomainError(
        "invalid_previous_snapshot",
        "previousSnapshotId does not match activation history",
      );
    }
    if (
      previous &&
      (previous.checkout.id !== snapshot.checkout.id ||
        previous.checkout.accountId !== snapshot.checkout.accountId ||
        previous.checkout.productId !== snapshot.checkout.productId ||
        previous.checkout.productVersion !== snapshot.checkout.productVersion ||
        previous.checkout.planId !== snapshot.checkout.planId ||
        previous.checkout.planVersion !== snapshot.checkout.planVersion ||
        previous.checkout.paymentReference !== snapshot.checkout.paymentReference)
    ) {
      throw new ActivationDomainError(
        "activation_identity_conflict",
        "activation identity cannot change across revisions",
      );
    }

    if (snapshot.revision === 1) {
      const existingActivationId = byCheckoutId.get(snapshot.checkout.id);
      if (existingActivationId) {
        const existing = getCurrent(existingActivationId);
        const sameIntent =
          existing.checkout.accountId === snapshot.checkout.accountId &&
          existing.checkout.productId === snapshot.checkout.productId &&
          existing.checkout.productVersion === snapshot.checkout.productVersion &&
          existing.checkout.planId === snapshot.checkout.planId &&
          existing.checkout.planVersion === snapshot.checkout.planVersion &&
          existing.checkout.paymentReference === snapshot.checkout.paymentReference;
        if (!sameIntent) {
          throw new ActivationDomainError(
            "checkout_activation_conflict",
            "checkout is already bound to another activation intent",
          );
        }
        return deepFreeze({
          snapshot: existing,
          appended: false,
          duplicateOf: existing.snapshotId,
        });
      }
      byCheckoutId.set(snapshot.checkout.id, snapshot.activationId);
    }

    bySnapshotId.set(snapshot.snapshotId, snapshot);
    bySourceEventId.set(snapshot.sourceEventId, snapshot.snapshotId);
    history.push(snapshot);
    histories.set(snapshot.activationId, history);
    return deepFreeze({ snapshot, appended: true, duplicateOf: null });
  }

  initialSnapshots.forEach(append);

  function listHistory(activationId) {
    return (histories.get(requireText(activationId, "activationId")) ?? [])
      .map(deepFreeze);
  }

  function getCurrent(activationId) {
    return listHistory(activationId).at(-1) ?? null;
  }

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
    getCurrentByCheckout(checkoutId) {
      const activationId = byCheckoutId.get(requireText(checkoutId, "checkoutId"));
      return activationId ? getCurrent(activationId) : null;
    },
    listCurrentByAccount(accountId) {
      const normalized = requireText(accountId, "accountId");
      return [...histories.keys()]
        .map(getCurrent)
        .filter((item) => item?.checkout.accountId === normalized)
        .sort((left, right) =>
          left.activationId.localeCompare(right.activationId),
        )
        .map(deepFreeze);
    },
  });
}
