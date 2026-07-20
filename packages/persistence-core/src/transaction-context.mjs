import {
  PersistenceDomainError,
  clone,
  deepFreeze,
  requireText,
} from "./model.mjs";

export const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createTransactionContext(draft, clock) {
  const collection = (name) => {
    const normalized = requireText(name, "collection");
    draft.collections[normalized] ??= {};
    return draft.collections[normalized];
  };

  return Object.freeze({
    revision: draft.revision,

    get(collectionName, id) {
      const value = collection(collectionName)[requireText(id, "id")];
      return value === undefined ? null : deepFreeze(clone(value));
    },

    put(collectionName, id, value, { ifAbsent = false } = {}) {
      const records = collection(collectionName);
      const normalizedId = requireText(id, "id");
      if (ifAbsent && records[normalizedId] !== undefined) {
        throw new PersistenceDomainError(
          "record_conflict",
          "record already exists",
          { details: { collection: collectionName, id: normalizedId } },
        );
      }
      records[normalizedId] = clone(value);
      return deepFreeze(clone(records[normalizedId]));
    },

    delete(collectionName, id) {
      const records = collection(collectionName);
      const normalizedId = requireText(id, "id");
      const existed = records[normalizedId] !== undefined;
      delete records[normalizedId];
      return existed;
    },

    list(collectionName) {
      return Object.entries(collection(collectionName))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, value]) => deepFreeze({ id, value: clone(value) }));
    },

    getIdempotency(key) {
      const value = draft.idempotency[requireText(key, "idempotencyKey")];
      return value === undefined ? null : deepFreeze(clone(value));
    },

    putIdempotency(key, value) {
      const normalized = requireText(key, "idempotencyKey");
      if (draft.idempotency[normalized] !== undefined) {
        throw new PersistenceDomainError(
          "idempotency_conflict",
          "idempotency key already exists",
          { details: { key: normalized } },
        );
      }
      draft.idempotency[normalized] = {
        key: normalized,
        value: clone(value),
        createdAt: clock(),
      };
      return deepFreeze(clone(draft.idempotency[normalized]));
    },

    enqueueOutbox({
      id,
      type,
      aggregateId = null,
      payload = {},
      headers = {},
      occurredAt = clock(),
    }) {
      const normalizedId = requireText(id, "outbox.id");
      if (draft.outbox.some((entry) => entry.id === normalizedId)) {
        throw new PersistenceDomainError(
          "outbox_id_conflict",
          "outbox id already exists",
          { details: { id: normalizedId } },
        );
      }
      const entry = {
        id: normalizedId,
        type: requireText(type, "outbox.type"),
        aggregateId:
          aggregateId === null ? null : requireText(aggregateId, "aggregateId"),
        payload: clone(payload),
        headers: clone(headers),
        occurredAt,
        status: "pending",
        attempts: 0,
        publishedAt: null,
        lastError: null,
      };
      draft.outbox.push(entry);
      return deepFreeze(clone(entry));
    },

    listOutbox({ status = "pending", limit = 100 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1) {
        throw new PersistenceDomainError(
          "invalid_argument",
          "outbox limit must be a positive safe integer",
        );
      }
      return draft.outbox
        .filter((entry) => status === null || entry.status === status)
        .sort(
          (left, right) =>
            left.occurredAt.localeCompare(right.occurredAt) ||
            left.id.localeCompare(right.id),
        )
        .slice(0, limit)
        .map((entry) => deepFreeze(clone(entry)));
    },

    markOutboxPublished(id, { publishedAt = clock() } = {}) {
      const normalizedId = requireText(id, "outbox.id");
      const entry = draft.outbox.find((item) => item.id === normalizedId);
      if (!entry) {
        throw new PersistenceDomainError(
          "outbox_not_found",
          "outbox entry was not found",
          { details: { id: normalizedId } },
        );
      }
      entry.status = "published";
      entry.publishedAt = publishedAt;
      entry.attempts += 1;
      entry.lastError = null;
      return deepFreeze(clone(entry));
    },

    markOutboxFailed(id, error) {
      const normalizedId = requireText(id, "outbox.id");
      const entry = draft.outbox.find((item) => item.id === normalizedId);
      if (!entry) {
        throw new PersistenceDomainError(
          "outbox_not_found",
          "outbox entry was not found",
          { details: { id: normalizedId } },
        );
      }
      entry.status = "pending";
      entry.attempts += 1;
      entry.lastError = String(error?.message ?? error ?? "unknown error");
      return deepFreeze(clone(entry));
    },
  });
}

