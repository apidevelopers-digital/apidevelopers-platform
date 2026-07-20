import {
  ProvisioningDomainError,
  deepFreeze,
  requireIso,
  requireText,
} from "./common.mjs";
import {
  createProvisioningSnapshot,
  isTerminalProvisioning,
} from "./model.mjs";

export function createProvisioningContext({
  repository,
  idFactory,
  actionIdFactory,
  clock,
}) {
  if (typeof idFactory !== "function" || typeof actionIdFactory !== "function") {
    throw new ProvisioningDomainError(
      "invalid_argument",
      "idFactory and actionIdFactory must be functions",
    );
  }

  const now = () => requireIso(clock(), "clock");
  const current = (provisioningId) => {
    const snapshot = repository.getCurrent(provisioningId);
    if (!snapshot) {
      throw new ProvisioningDomainError(
        "provisioning_not_found",
        "provisioning was not found",
        { provisioningId },
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
    if (isTerminalProvisioning(snapshot)) {
      throw new ProvisioningDomainError(
        "terminal_provisioning",
        "terminal provisioning cannot transition",
        { status: snapshot.status },
      );
    }
  };

  function append(
    previous,
    sourceEventId,
    patch,
    eventType,
    eventData = {},
  ) {
    const at = now();
    const snapshot = createProvisioningSnapshot({
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
            provisioningId: stored.snapshot.provisioningId,
            subscriptionId: stored.snapshot.subscriptionId,
            accountId: stored.snapshot.accountId,
            occurredAt: at,
            data: eventData,
          }]
        : [],
    });
  }

  return Object.freeze({
    repository,
    idFactory,
    actionIdFactory,
    now,
    current,
    duplicate,
    mutable,
    append,
  });
}
