import {
  OutboxDomainError,
  deepFreeze,
  requireIso,
  requirePositiveSafeInteger,
  requireText,
} from "./common.mjs";

function assertMethod(target, method, name) {
  if (typeof target?.[method] !== "function") {
    throw new OutboxDomainError(
      "invalid_dependency",
      `${name}.${method} must be a function`,
    );
  }
}

function addMilliseconds(iso, milliseconds) {
  return new Date(Date.parse(iso) + milliseconds).toISOString();
}

function defaultRetryDelay({ attempts }) {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts));
}

function eventFromEntry(entry) {
  return deepFreeze({
    id: entry.id,
    type: entry.type,
    aggregateId: entry.aggregateId,
    payload: entry.payload,
    headers: entry.headers,
    occurredAt: entry.occurredAt,
  });
}

export function createOutboxPublisher({
  store,
  transport,
  workerId,
  clock = () => new Date().toISOString(),
  leaseMilliseconds = 30_000,
  maxAttempts = 5,
  retryDelay = defaultRetryDelay,
} = {}) {
  assertMethod(store, "transaction", "store");
  assertMethod(transport, "publish", "transport");
  const normalizedWorkerId = requireText(workerId, "workerId");
  requirePositiveSafeInteger(leaseMilliseconds, "leaseMilliseconds");
  requirePositiveSafeInteger(maxAttempts, "maxAttempts");
  if (typeof retryDelay !== "function") {
    throw new OutboxDomainError(
      "invalid_argument",
      "retryDelay must be a function",
    );
  }

  const now = () => requireIso(clock(), "clock");

  async function claim(limit) {
    const at = now();
    const leaseUntil = addMilliseconds(at, leaseMilliseconds);
    const committed = await store.transaction((tx) =>
      tx.claimOutbox({
        workerId: normalizedWorkerId,
        limit,
        at,
        leaseUntil,
      }),
    );
    return committed.result;
  }

  async function complete(entry) {
    const publishedAt = now();
    const committed = await store.transaction((tx) =>
      tx.completeOutboxClaim(entry.id, {
        workerId: normalizedWorkerId,
        publishedAt,
      }),
    );
    return committed.result;
  }

  async function fail(entry, error) {
    const nextAttempt = entry.attempts + 1;
    const deadLetter = nextAttempt >= maxAttempts;
    const at = now();
    const delay = retryDelay({
      attempts: nextAttempt,
      entry: deepFreeze(entry),
      error,
    });
    if (!Number.isSafeInteger(delay) || delay < 0) {
      throw new OutboxDomainError(
        "invalid_retry_delay",
        "retryDelay must return a non-negative safe integer",
      );
    }
    const committed = await store.transaction((tx) =>
      tx.failOutboxClaim(entry.id, error, {
        workerId: normalizedWorkerId,
        deadLetter;
        nextAttemptAt: addMilliseconds(at, delay),
        deadLetteredAt: at,
      }),
    );
    return committed.result;
  }

  return Object.freeze({
    workerId: normalizedWorkerId,

    async runOnce({ limit = 100 } = {}) {
      requirePositiveSafeInteger(limit, "limit");
      const entries = await claim(limit);
      const results = [];

      for (const entry of entries) {
        try {
          const transportResult = await transport.publish(eventFromEntry(entry));
          const settled = await complete(entry);
          results.push(
            deepFreeze({
              id: entry.id,
              status: "published",
              attempts: settled.attempts,
              transportResult:
                transportResult === undefined ? null : transportResult,
            }),
          );
        } catch (error) {
          const settled = await fail(entry, error);
          results.push(
            deepFreeze({
              id: entry.id,
              status: settled.status,
              attempts: settled.attempts,
              error: String(error?.message ?? error ?? "unknown error"),
              nextAttemptAt: settled.nextAttemptAt,
            }),
          );
        }
      }

      return deepFreeze({
        workerId: normalizedWorkerId,
        claimed: entries.length,
        published: results.filter((item) => item.status === "published").length,
        pending: results.filter((item) => item.status === "pending").length,
        deadLettered: results.filter((item) => item.status === "dead_letter").length,
        results,
      });
    },
  });
}
