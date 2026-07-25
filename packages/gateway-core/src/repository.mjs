import { GatewayDomainError, deepFreeze, requireText } from "./common.mjs";
import { createGatewayRequest } from "./model.mjs";

export function createMemoryGatewayRepository({ initialSnapshots = [] } = {}) {
  const histories = new Map();
  const byIdempotencyKey = new Map();
  const bySnapshotId = new Map();

  function listHistory(requestId) {
    return (histories.get(requireText(requestId, "requestId")) ?? []).map(deepFreeze);
  }

  function getCurrent(requestId) {
    return listHistory(requestId).at(-1) ?? null;
  }

  function append(input) {
    const snapshot = createGatewayRequest(input);
    const duplicateRequestId =
      snapshot.revision === 1 ? byIdempotencyKey.get(snapshot.idempotencyKey) : null;
    if (duplicateRequestId) {
      return deepFreeze({
        snapshot: getCurrent(duplicateRequestId),
        appended: false,
        duplicateOf: duplicateRequestId,
      });
    }
    if (bySnapshotId.has(snapshot.snapshotId)) {
      throw new GatewayDomainError(
        "gateway_snapshot_id_conflict",
        "snapshot id already exists",
      );
    }
    const history = histories.get(snapshot.requestId) ?? [];
    const expectedRevision = history.length + 1;
    if (snapshot.revision !== expectedRevision) {
      throw new GatewayDomainError(
        "invalid_gateway_revision",
        "gateway revision must be sequential",
        { expectedRevision, revision: snapshot.revision },
      );
    }
    const previous = history.at(-1) ?? null;
    if (snapshot.revision > 1 && snapshot.previousSnapshotId !== previous?.snapshotId) {
      throw new GatewayDomainError(
        "invalid_previous_snapshot",
        "previousSnapshotId does not match gateway history",
      );
    }
    if (
      previous &&
      (previous.principal.apiKeyId !== snapshot.principal.apiKeyId ||
        previous.principal.tenantId !== snapshot.principal.tenantId ||
        previous.principal.projectId !== snapshot.principal.projectId ||
        previous.principal.subscriptionId !== snapshot.principal.subscriptionId ||
        previous.apiId !== snapshot.apiId ||
        previous.operation !== snapshot.operation)
    ) {
      throw new GatewayDomainError(
        "gateway_identity_conflict",
        "gateway request identity cannot change across revisions",
      );
    }
    history.push(snapshot);
    histories.set(snapshot.requestId, history);
    bySnapshotId.set(snapshot.snapshotId, snapshot);
    if (snapshot.revision === 1) {
      byIdempotencyKey.set(snapshot.idempotencyKey, snapshot.requestId);
    }
    return deepFreeze({ snapshot, appended: true, duplicateOf: null });
  }

  initialSnapshots.forEach(append);

  return Object.freeze({
    kind: "memory",
    append,
    listHistory,
    getCurrent,
    getByIdempotencyKey(idempotencyKey) {
      const requestId = byIdempotencyKey.get(requireText(idempotencyKey, "idempotencyKey"));
      return requestId ? getCurrent(requestId) : null;
    },
  });
}
