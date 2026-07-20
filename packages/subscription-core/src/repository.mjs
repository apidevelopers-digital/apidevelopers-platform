
import {
  SubscriptionDomainError,
  createSubscriptionSnapshot,
  deepFreeze,
  requireText,
} from "./model.mjs";

export function createMemorySubscriptionRepository({ initialSnapshots = [] } = {}) {
  const bySnapshotId = new Map();
  const bySourceEventId = new Map();
  const histories = new Map();

  function append(input) {
    const snapshot = createSubscriptionSnapshot(input);
    const duplicateId = bySourceEventId.get(snapshot.sourceEventId);
    if (duplicateId) {
      return deepFreeze({
        snapshot: bySnapshotId.get(duplicateId),
        appended: false,
        duplicateOf: duplicateId,
      });
    }
    if (bySnapshotId.has(snapshot.snapshotId)) {
      throw new SubscriptionDomainError(
        "subscription_snapshot_id_conflict",
        "snapshot id already exists",
        { snapshotId: snapshot.snapshotId },
      );
    }

    const history = histories.get(snapshot.subscriptionId) ?? [];
    const expectedRevision = history.length + 1;
    if (snapshot.revision !== expectedRevision) {
      throw new SubscriptionDomainError(
        "invalid_subscription_revision",
        "subscription revision must be sequential",
        { expectedRevision, revision: snapshot.revision },
      );
    }

    const previous = history.at(-1) ?? null;
    if (snapshot.revision > 1 && snapshot.previousSnapshotId !== previous?.snapshotId) {
      throw new SubscriptionDomainError(
        "invalid_previous_snapshot",
        "previousSnapshotId does not match current history",
      );
    }
    if (snapshot.revision === 1 && snapshot.previousSnapshotId !== null) {
      throw new SubscriptionDomainError(
        "invalid_previous_snapshot",
        "first revision cannot reference a previous snapshot",
      );
    }
    if (previous && previous.tenantId !== snapshot.tenantId) {
      throw new SubscriptionDomainError(
        "subscription_tenant_conflict",
        "tenantId cannot change across revisions",
      );
    }

    bySnapshotId.set(snapshot.snapshotId, snapshot);
    bySourceEventId.set(snapshot.sourceEventId, snapshot.snapshotId);
    history.push(snapshot);
    histories.set(snapshot.subscriptionId, history);

    return deepFreeze({ snapshot, appended: true, duplicateOf: null });
  }

  initialSnapshots.forEach(append);

  function listHistory(subscriptionId) {
    return (histories.get(requireText(subscriptionId, "subscriptionId")) ?? []).map(deepFreeze);
  }

  function getCurrent(subscriptionId) {
    return listHistory(subscriptionId).at(-1) ?? null;
  }

  return Object.freeze({
    kind: "memory",
    append,
    getBySnapshotId(snapshotId) {
      const value = bySnapshotId.get(requireText(snapshotId, "snapshotId"));
      return value ? deepFreeze(value) : null;
    },
    getBySourceEventId(sourceEventId) {
      const snapshotId = bySourceEventId.get(requireText(sourceEventId, "sourceEventId"));
      return snapshotId ? deepFreeze(bySnapshotId.get(snapshotId)) : null;
    },
    listHistory,
    getCurrent,
    listCurrentByTenant(tenantId) {
      const normalizedTenantId = requireText(tenantId, "tenantId");
      return [...histories.keys()]
        .map(getCurrent)
        .filter((item) => item?.tenantId === normalizedTenantId)
        .sort((left, right) => left.subscriptionId.localeCompare(right.subscriptionId))
        .map(deepFreeze);
    },
  });
}
