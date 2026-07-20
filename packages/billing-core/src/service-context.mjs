import {
  BillingDomainError,
  createInvoiceSnapshot,
  deepFreeze,
  requireIso,
  requireText,
} from "./model.mjs";

export function createBillingContext({
  repository,
  idFactory,
  lineIdFactory,
  clock,
  overagePriceResolver,
  assertTenantOperational,
}) {
  if (typeof idFactory !== "function" || typeof lineIdFactory !== "function") {
    throw new BillingDomainError(
      "invalid_argument",
      "idFactory and lineIdFactory must be functions",
    );
  }
  if (typeof overagePriceResolver !== "function") {
    throw new BillingDomainError(
      "invalid_argument",
      "overagePriceResolver must be a function",
    );
  }

  const now = () => requireIso(clock(), "clock");
  const current = (invoiceId) => {
    const invoice = repository.getCurrent(invoiceId);
    if (!invoice) {
      throw new BillingDomainError(
        "invoice_not_found",
        "invoice was not found",
        { invoiceId },
      );
    }
    return invoice;
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

  function append(previous, sourceEventId, patch, eventType, eventData = {}) {
    const at = now();
    const snapshot = createInvoiceSnapshot({
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
            invoiceId: stored.snapshot.invoiceId,
            subscriptionId: stored.snapshot.subscriptionId,
            tenantId: stored.snapshot.tenantId,
            occurredAt: at,
            data: eventData,
          }]
        : [],
    });
  }

  return Object.freeze({
    repository,
    lineIdFactory,
    overagePriceResolver,
    assertTenantOperational,
    idFactory,
    now,
    current,
    duplicate,
    append,
  });
}
