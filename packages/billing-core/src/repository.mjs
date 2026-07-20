import {
  BillingDomainError,
  createInvoiceSnapshot,
  deepFreeze,
  requireText,
} from "./model.mjs";

export function createMemoryBillingRepository({ initialSnapshots = [] } = {}) {
  const bySnapshotId = new Map();
  const bySourceEventId = new Map();
  const histories = new Map();

  function append(input) {
    const snapshot = createInvoiceSnapshot(input);
    const duplicateSnapshotId = bySourceEventId.get(snapshot.sourceEventId);
    if (duplicateSnapshotId) {
      return deepFreeze({
        snapshot: bySnapshotId.get(duplicateSnapshotId),
        appended: false,
        duplicateOf: duplicateSnapshotId,
      });
    }
    if (bySnapshotId.has(snapshot.snapshotId)) {
      throw new BillingDomainError(
        "invoice_snapshot_id_conflict",
        "snapshot id already exists",
        { snapshotId: snapshot.snapshotId },
      );
    }

    const history = histories.get(snapshot.invoiceId) ?? [];
    const expectedRevision = history.length + 1;
    if (snapshot.revision !== expectedRevision) {
      throw new BillingDomainError(
        "invalid_invoice_revision",
        "invoice revision must be sequential",
        { expectedRevision, revision: snapshot.revision },
      );
    }

    const previous = history.at(-1) ?? null;
    if (snapshot.revision === 1 && snapshot.previousSnapshotId !== null) {
      throw new BillingDomainError(
        "invalid_previous_snapshot",
        "first invoice revision cannot reference a previous snapshot",
      );
    }
    if (
      snapshot.revision > 1 &&
      snapshot.previousSnapshotId !== previous?.snapshotId
    ) {
      throw new BillingDomainError(
        "invalid_previous_snapshot",
        "previousSnapshotId does not match invoice history",
      );
    }
    if (
      previous &&
      (previous.tenantId !== snapshot.tenantId ||
        previous.subscriptionId !== snapshot.subscriptionId ||
        previous.currency !== snapshot.currency)
    ) {
      throw new BillingDomainError(
        "invoice_identity_conflict",
        "invoice identity cannot change across revisions",
      );
    }

    bySnapshotId.set(snapshot.snapshotId, snapshot);
    bySourceEventId.set(snapshot.sourceEventId, snapshot.snapshotId);
    history.push(snapshot);
    histories.set(snapshot.invoiceId, history);
    return deepFreeze({ snapshot, appended: true, duplicateOf: null });
  }

  initialSnapshots.forEach(append);

  function listHistory(invoiceId) {
    return (histories.get(requireText(invoiceId, "invoiceId")) ?? []).map(deepFreeze);
  }

  function getCurrent(invoiceId) {
    return listHistory(invoiceId).at(-1) ?? null;
  }

  return Object.freeze({
    kind: "memory",
    append,
    getCurrent,
    listHistory,
    getBySnapshotId(snapshotId) {
      const value = bySnapshotId.get(requireText(snapshotId, "snapshotId"));
      return value ? deepFreeze(value) : null;
    },
    getBySourceEventId(sourceEventId) {
      const snapshotId = bySourceEventId.get(requireText(sourceEventId, "sourceEventId"));
      return snapshotId ? deepFreeze(bySnapshotId.get(snapshotId)) : null;
    },
    listCurrentByTenant(tenantId) {
      const normalized = requireText(tenantId, "tenantId");
      return [...histories.keys()]
        .map(getCurrent)
        .filter((invoice) => invoice?.tenantId === normalized)
        .sort((left, right) => left.invoiceId.localeCompare(right.invoiceId))
        .map(deepFreeze);
    },
  });
}
