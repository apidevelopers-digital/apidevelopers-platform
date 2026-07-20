import {
  ProvisioningDomainError,
  deepFreeze,
  requireText,
} from "./common.mjs";
import { createProvisioningSnapshot } from "./model.mjs";

export function createMemoryProvisioningRepository({
  initialSnapshots = [],
} = {}) {
  const bySnapshotId = new Map();
  const bySourceEventId = new Map();
  const histories = new Map();
  const bySubscriptionId = new Map();

  function append(input) {
    const snapshot = createProvisioningSnapshot(input);
    const duplicateSnapshotId = bySourceEventId.get(snapshot.sourceEventId);
    if (duplicateSnapshotId) {
      return deepFreeze({
        snapshot: bySnapshotId.get(duplicateSnapshotId),
        appended: false,
        duplicateOf: duplicateSnapshotId,
      });
    }
    if (bySnapshotId.has(snapshot.snapshotId)) {
      throw new ProvisioningDomainError(
        "provisioning_snapshot_id_conflict",
        "snapshot id already exists",
      );
    }

    const history = histories.get(snapshot.provisioningId) ?? [];
    const expectedRevision = history.length + 1;
    if (snapshot.revision !== expectedRevision) {
      throw new ProvisioningDomainError(
        "invalid_provisioning_revision",
        "provisioning revision must be sequential",
        { expectedRevision, revision: snapshot.revision },
      );
    }
    const previous = history.at(-1) ?? null;
    if (
      snapshot.revision === 1 &&
      snapshot.previousSnapshotId !== null
    ) {
      throw new ProvisioningDomainError(
        "invalid_previous_snapshot",
        "first provisioning revision cannot reference previous snapshot",
      );
    }
    if (
      snapshot.revision > 1 &&
      snapshot.previousSnapshotId !== previous?.snapshotId
    ) {
      throw new ProvisioningDomainError(
        "invalid_previous_snapshot",
        "previousSnapshotId does not match provisioning history",
      );
    }
    if (
      previous &&
      (
        previous.subscriptionId !== snapshot.subscriptionId ||
        previous.accountId !== snapshot.accountId ||
        previous.ownerUserId !== snapshot.ownerUserId ||
        previous.productId !== snapshot.productId ||
        previous.productVersion !== snapshot.productVersion ||
        previous.planId !== snapshot.planId ||
        previous.planVersion !== snapshot.planVersion
      )
    ) {
      throw new ProvisioningDomainError(
        "provisioning_identity_conflict",
        "provisioning identity cannot change across revisions",
      );
    }

    if (snapshot.revision === 1) {
      const existingProvisioningId = bySubscriptionId.get(
        snapshot.subscriptionId,
      );
      if (existingProvisioningId) {
        const existing = getCurrent(existingProvisioningId);
        const sameIntent =
          existing.accountId === snapshot.accountId &&
          existing.ownerUserId === snapshot.ownerUserId &&
          existing.productId === snapshot.productId &&
          existing.productVersion === snapshot.productVersion &&
          existing.planId === snapshot.planId &&
          existing.planVersion === snapshot.planVersion;
        if (!sameIntent) {
          throw new ProvisioningDomainError(
            "subscription_provisioning_conflict",
            "subscription is already bound to another provisioning intent",
          );
        }
        return deepFreeze({
          snapshot: existing,
          appended: false,
          duplicateOf: existing.snapshotId,
        });
      }
      bySubscriptionId.set(snapshot.subscriptionId, snapshot.provisioningId);
    }

    bySnapshotId.set(snapshot.snapshotId, snapshot);
    bySourceEventId.set(snapshot.sourceEventId, snapshot.snapshotId);
    history.push(snapshot);
    histories.set(snapshot.provisioningId, history);
    return deepFreeze({
      snapshot,
      appended: true,
      duplicateOf: null,
    });
  }

  initialSnapshots.forEach(append);

  function listHistory(provisioningId) {
    return (
      histories.get(requireText(provisioningId, "provisioningId")) ?? []
    ).map(deepFreeze);
  }

  function getCurrent(provisioningId) {
    return listHistory(provisioningId).at(-1) ?? null;
  }

  return Object.freeze({
    kind: "memory",
    append,
    getCurrent,
    listHistory,
    getBySourceEventId(sourceEventId) {
      const snapshotId = bySourceEventId.get(
        requireText(sourceEventId, "sourceEventId"),
      );
      return snapshotId ? deepFreeze(bySnapshotId.get(snapshotId)) : null;
    },
    getCurrentBySubscription(subscriptionId) {
      const provisioningId = bySubscriptionId.get(
        requireText(subscriptionId, "subscriptionId"),
      );
      return provisioningId ? getCurrent(provisioningId) : null;
    },
    listCurrentByAccount(accountId) {
      const normalized = requireText(accountId, "accountId");
      return [...histories.keys()]
        .map(getCurrent)
        .filter((item) => item?.accountId === normalized)
        .sort((left, right) =>
          left.provisioningId.localeCompare(right.provisioningId),
        )
        .map(deepFreeze);
    },
  });
}
