import {
  CheckoutDomainError,
  createCheckoutSnapshot,
  deepFreeze,
  requireText,
} from "./model.mjs";

export function createMemoryCheckoutRepository({ initialSnapshots = [] } = {}) {
  const bySnapshotId = new Map();
  const bySourceEventId = new Map();
  const byIdempotencyKey = new Map();
  const histories = new Map();

  function append(input) {
    const snapshot = createCheckoutSnapshot(input);
    const duplicateEvent = bySourceEventId.get(snapshot.sourceEventId);
    if (duplicateEvent) {
      return deepFreeze({
        snapshot: bySnapshotId.get(duplicateEvent),
        appended: false,
        duplicateOf: duplicateEvent,
      });
    }
    if (bySnapshotId.has(snapshot.snapshotId)) {
      throw new CheckoutDomainError(
        "checkout_snapshot_id_conflict",
        "snapshot id already exists",
        { snapshotId: snapshot.snapshotId },
      );
    }

    const history = histories.get(snapshot.checkoutId) ?? [];
    const expectedRevision = history.length + 1;
    if (snapshot.revision !== expectedRevision) {
      throw new CheckoutDomainError(
        "invalid_checkout_revision",
        "checkout revision must be sequential",
        { expectedRevision, revision: snapshot.revision },
      );
    }
    const previous = history.at(-1) ?? null;
    if (snapshot.revision === 1 && snapshot.previousSnapshotId !== null) {
      throw new CheckoutDomainError(
        "invalid_previous_snapshot",
        "first revision cannot reference a previous snapshot",
      );
    }
    if (snapshot.revision > 1 && snapshot.previousSnapshotId !== previous?.snapshotId) {
      throw new CheckoutDomainError(
        "invalid_previous_snapshot",
        "previousSnapshotId does not match checkout history",
      );
    }
    if (previous && (
      previous.accountId !== snapshot.accountId ||
      previous.productId !== snapshot.productId ||
      previous.productVersion !== snapshot.productVersion ||
      previous.planId !== snapshot.planId ||
      previous.planVersion !== snapshot.planVersion ||
      previous.amount !== snapshot.amount ||
      previous.currency !== snapshot.currency ||
      previous.provider !== snapshot.provider ||
      previous.providerSessionId !== snapshot.providerSessionId ||
      previous.idempotencyKey !== snapshot.idempotencyKey
    )) {
      throw new CheckoutDomainError(
        "checkout_identity_conflict",
        "checkout identity cannot change across revisions",
      );
    }

    if (snapshot.revision === 1) {
      const existing = byIdempotencyKey.get(snapshot.idempotencyKey);
      if (existing) {
        const existingSnapshot = bySnapshotId.get(existing);
        const sameIntent = [
          "accountId",
          "productId",
          "productVersion",
          "planId",
          "planVersion",
          "amount",
          "currency",
          "provider",
        ].every((field) => existingSnapshot[field] === snapshot[field]);
        if (!sameIntent) {
          throw new CheckoutDomainError(
            "idempotency_key_conflict",
            "idempotency key is already bound to a different checkout intent",
          );
        }
        return deepFreeze({
          snapshot: existingSnapshot,
          appended: false,
          duplicateOf: existingSnapshot.snapshotId,
        });
      }
      byIdempotencyKey.set(snapshot.idempotencyKey, snapshot.snapshotId);
    }

    bySnapshotId.set(snapshot.snapshotId, snapshot);
    bySourceEventId.set(snapshot.sourceEventId, snapshot.snapshotId);
    history.push(snapshot);
    histories.set(snapshot.checkoutId, history);
    return deepFreeze({ snapshot, appended: true, duplicateOf: null });
  }

  initialSnapshots.forEach(append);

  function listHistory(checkoutId) {
    return (histories.get(requireText(checkoutId, "checkoutId")) ?? []).map(deepFreeze);
  }

  function getCurrent(checkoutId) {
    return listHistory(checkoutId).at(-1) ?? null;
  }

  return Object.freeze({
    kind: "memory",
    append,
    getCurrent,
    listHistory,
    getByIdempotencyKey(idempotencyKey) {
      const snapshotId = byIdempotencyKey.get(requireText(idempotencyKey, "idempotencyKey"));
      return snapshotId ? deepFreeze(bySnapshotId.get(snapshotId)) : null;
    },
    getBySourceEventId(sourceEventId) {
      const snapshotId = bySourceEventId.get(requireText(sourceEventId, "sourceEventId"));
      return snapshotId ? deepFreeze(bySnapshotId.get(snapshotId)) : null;
    },
    listCurrentByAccount(accountId) {
      const normalized = requireText(accountId, "accountId");
      return [...histories.keys()]
        .map(getCurrent)
        .filter((item) => item?.accountId === normalized)
        .sort((left, right) => left.checkoutId.localeCompare(right.checkoutId))
        .map(deepFreeze);
    },
  });
}
