import {
  PersistenceDomainError,
  clone,
  deepFreeze,
  requireText,
} from "./model.mjs";

export const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function requirePositiveSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new PersistenceDomainError(
      "invalid_argument",
      `${name} must be a positive safe integer`,
    );
  }
  return value;
}

function requireIso(value, name) {
  const normalized = requireText(value, name);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new PersistenceDomainError("invalid_argument", `${name} must be an ISO date`);
  }
  return normalized;
}

function findOutboxEntry(draft, id) {
  const normalizedId = requireText(id, "outbox.id");
  const entry = draft.outbox.find((item) => item.id === normalizedId);
  if (!entry) {
    throw new PersistenceDomainError(
      "outbox_not_found",
      "outbox entry was not found",
      { details: { id: normalizedId } },
    );
  }
  return entry;
}

function assertClaimOwner(entry, workerId) {
  const normalizedWorkerId = requireText(workerId, "workerId");
  if (entry.status !== "publishing" || entry.claimedBy !== normalizedWorkerId) {
    throw new PersistenceDomainError(
      "outbox_claim_conflict",
      "outbox entry is not claimed by this worker",
      {
        details: {
          id: entry.id,
          status: entry.status,
          claimedBy: entry.claimedBy,
          workerId: normalizedWorkerId,
        },
      },
    );
  }
  return normalizedWorkerId;
}

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
        occurredAt: requireIso(occurredAt, "occurredAt"),
        status: "pending",
        attempts: 0,
        publishedAt: null,
        lastError: null,
        claimedBy: null,
        claimedAt: null,
        leaseUntil: null,
        nextAttemptAt: null,
        deadLetteredAt: null,
      };
      draft.outbox.push(entry);
      return deepFreeze(clone(entry));
    },

    listOutbox({ status = "pending", limit = 100 } = {}) {
      requirePositiveSafeInteger(limit, "outbox limit");
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

    claimOutbox({
      workerId,
      limit = 100,
      at = clock(),
      leaseUntil,
    }) {
      const normalizedWorkerId = requireText(workerId, "workerId");
      requirePositiveSafeInteger(limit, "outbox limit");
      const normalizedAt = requireIso(at, "at");
      const normalizedLeaseUntil = requireIso(leaseUntil, "leaseUntil");
      if (Date.parse(normalizedLeaseUntil) <= Date.parse(normalizedAt)) {
        throw new PersistenceDomainError(
          "invalid_argument",
          "leaseUntil must be after at",
        );
      }

      const claimed = draft.outbox
        .filter((entry) => {
          const retryReady =
            entry.nextAttemptAt === null ||
            Date.parse(entry.nextAttemptAt) <= Date.parse(normalizedAt);
          if (entry.status === "pending") return retryReady;
          return (
            entry.status === "publishing" &&
            entry.leaseUntil !== null &&
            Date.parse(entry.leaseUntil) <= Date.parse(normalizedAt)
          );
        })
        .sort(
          (left, right) =>
            left.occurredAt.localeCompare(right.occurredAt) ||
            left.id.localeCompare(right.id),
        )
        .slice(0, limit);

      for (const entry of claimed) {
        entry.status = "publishing";
        entry.claimedBy = normalizedWorkerId;
        entry.claimedAt = normalizedAt;
        entry.leaseUntil = normalizedLeaseUntil;
      }
      return claimed.map((entry) => deepFreeze(clone(entry)));
    },

    completeOutboxClaim(
      id,
      { workerId, publishedAt = clock() } = {},
    ) {
      const entry = findOutboxEntry(draft, id);
      assertClaimOwner(entry, workerId);
      entry.status = "published";
      entry.publishedAt = requireIso(publishedAt, "publishedAt");
      entry.attempts += 1;
      entry.lastError = null;
      entry.claimedBy = null;
      entry.claimedAt = null;
      entry.leaseUntil = null;
      entry.nextAttemptAt = null;
      return deepFreeze(clone(entry));
    },

    failOutboxClaim(
      id,
      error,
      {
        workerId,
        nextAttemptAt = clock(),
        deadLetter = false,
        deadLetteredAt = clock(),
      } = {},
    ) {
      const entry = findOutboxEntry(draft, id);
      assertClaimOwner(entry, workerId);
      entry.attempts += 1;
      entry.lastError = String(error?.message ?? error ?? "unknown error").slice(0, 2000);
      entry.claimedBy = null;
      entry.claimedAt = null;
      entry.leaseUntil = null;
      if (deadLetter === true) {
        entry.status = "dead_letter";
        entry.deadLetteredAt = requireIso(deadLetteredAt, "deadLetteredAt");
        entry.nextAttemptAt = null;
      } else {
        entry.status = "pending";
        entry.nextAttemptAt = requireIso(nextAttemptAt, "nextAttemptAt");
        entry.deadLetteredAt = null;
      }
      return deepFreeze(clone(entry));
    },

    markOutboxPublished(id, { publishedAt = clock() } = {}) {
      const entry = findOutboxEntry(draft, id);
      entry.status = "published";
      entry.publishedAt = requireIso(publishedAt, "publishedAt");
      entry.attempts += 1;
      entry.lastError = null;
      entry.claimedBy = null;
      entry.claimedAt = null;
      entry.leaseUntil = null;
      entry.nextAttemptAt = null;
      return deepFreeze(clone(entry));
    },

    markOutboxFailed(id, error) {
      const entry = findOutboxEntry(draft, id);
      entry.status = "pending";
      entry.attempts += 1;
      entry.lastError = String(error?.message ?? error ?? "unknown error").slice(0, 2000);
      entry.claimedBy = null;
      entry.claimedAt = null;
      entry.leaseUntil = null;
      entry.nextAttemptAt = null;
      return deepFreeze(clone(entry));
    },
  });
}
