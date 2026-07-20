import {
  ActivationDomainError,
  deepFreeze,
  requireIso,
  requireText,
} from "./common.mjs";
import {
  createActivationSnapshot,
  isTerminalActivation,
} from "./model.mjs";

export function createActivationContext({
  repository,
  idFactory,
  clock,
}) {
  if (typeof idFactory !== "function") {
    throw new ActivationDomainError(
      "invalid_argument",
      "idFactory must be a function",
    );
  }

  const now = () => requireIso(clock(), "clock");
  const current = (activationId) => {
    const snapshot = repository.getCurrent(activationId);
    if (!snapshot) {
      throw new ActivationDomainError(
        "activation_not_found",
        "activation was not found",
        { activationId },
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
    if (isTerminalActivation(snapshot)) {
      throw new ActivationDomainError(
        "terminal_activation",
        "terminal activation cannot transition",
        { status: snapshot.status },
      );
    }
  };

  function append(previous, sourceEventId, patch, eventType, data = {}) {
    const at = now();
    const snapshot = createActivationSnapshot({
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
            activationId: stored.snapshot.activationId,
            checkoutId: stored.snapshot.checkout.id,
            accountId: stored.snapshot.checkout.accountId,
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
