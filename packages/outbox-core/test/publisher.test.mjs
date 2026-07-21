import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyPersistenceState,
  deepFreeze,
} from "../../persistence-core/src/model.mjs";
import {
  createTransactionContext,
} from "../../persistence-core/src/transaction-context.mjs";
import {
  createOutboxPublisher,
} from "../src/index.mjs";

const T0 = "2026-07-21T03:00:00.000Z";
const T1 = "2026-07-21T03:01:00.000Z";
const T2 = "2026-07-21T03:02:00.000Z";

function createMemoryStore() {
  let state = createEmptyPersistenceState(T0);
  return {
    async transaction(work) {
      const draft = structuredClone(state);
      const tx = createTransactionContext(draft, () => T0);
      const result = await work(tx);
      draft.revision += 1;
      draft.updatedAt = T0;
      state = draft;
      return deepFreeze({ result, revision: state.revision });
    },
    read() {
      return deepFreeze(state);
    },
  };
}

async function enqueue(store, entries) {
  await store.transaction((tx) => {
    for (const entry of entries) tx.enqueueOutbox(entry);
  });
}

function clock(values) {
  const queue = [...values];
  return () => queue.shift() ?? values.at(-1);
}

test("publishes claimed events and confirms them transactionally", async () => {
  const store = createMemoryStore();
  await enqueue(store, [
    { id: "e1", type: "tenant.created", payload: { tenantId: "t1" }, occurredAt: T0 },
  ]);
  const published = [];
  const publisher = createOutboxPublisher({
    store,
    transport: {
      async publish(event) {
        published.push(event);
        return { brokerId: "b1" };
      },
    },
    workerId: "worker-a",
    clock: clock([T0, T1]),
  });
  const result = await publisher.runOnce();
  assert.equal(result.published, 1);
  assert.equal(result.pending, 0);
  assert.equal(published[0].id, "e1");
  assert.equal(store.read().outbox[0].status, "published");
  assert.equal(store.read().outbox[0].attempts, 1);
});

test("does not double-publish an already completed entry", async () => {
  const store = createMemoryStore();
  await enqueue(store, [{ id: "e1", type: "tenant.created", occurredAt: T0 }]);
  let calls = 0;
  const publisher = createOutboxPublisher({
    store,
    transport: {
      async publish() {
        calls += 1;
      },
    },
    workerId: "worker-a",
    clock: clock([T0, T1, T2]),
  });
  await publisher.runOnce();
  const second = await publisher.runOnce();
  assert.equal(second.claimed, 0);
  assert.equal(calls, 1);
});

test("schedules retry after a transport failure", async () => {
  const store = createMemoryStore();
  await enqueue(store, [{ id: "e1", type: "tenant.created", occurredAt: T0 }]);
  const publisher = createOutboxPublisher({
    store,
    transport: {
      async publish() {
        throw new Error("broker unavailable");
      },
    },
    workerId: "worker-a",
    maxAttempts: 3,
    retryDelay: () => 60_000,
    clock: clock([T0, T0]),
  });
  const result = await publisher.runOnce();
  assert.equal(result.pending, 1);
  assert.equal(store.read().outbox[0].status, "pending");
  assert.equal(store.read().outbox[0].attempts, 1);
  assert.equal(store.read().outbox[0].nextAttemptAt, T1);
});

test("moves an event to dead-letter after the configured attempts", async () => {
  const store = createMemoryStore();
  await enqueue(store, [{ id: "e1", type: "tenant.created", occurredAt: T0 }]);
  const failingTransport = {
    async publish() {
      throw new Error("broker unavailable");
    },
  };
  const first = createOutboxPublisher({
    store,
    transport: failingTransport,
    workerId: "worker-a",
    maxAttempts: 2,
    retryDelay: () => 0,
    clock: clock([T0, T0]),
  });
  await first.runOnce();
  const second = createOutboxPublisher({
    store,
    transport: failingTransport,
    workerId: "worker-b",
    maxAttempts: 2,
    retryDelay: () => 0,
    clock: clock([T1, T1]),
  });
  const result = await second.runOnce();
  assert.equal(result.deadLettered, 1);
  assert.equal(store.read().outbox[0].status, "dead_letter");
  assert.equal(store.read().outbox[0].attempts, 2);
});

test("respects an active lease owned by another worker", async () => {
  const store = createMemoryStore();
  await enqueue(store, [{ id: "e1", type: "tenant.created", occurredAt: T0 }]);
  await store.transaction((tx) =>
    tx.claimOutbox({
      workerId: "worker-a",
      limit: 1,
      at: T0,
      leaseUntil: T2,
    }),
  );
  let calls = 0;
  const publisher = createOutboxPublisher({
    store,
    transport: {
      async publish() {
        calls += 1;
      },
    },
    workerId: "worker-b",
    clock: clock([T1]),
  });
  const result = await publisher.runOnce();
  assert.equal(result.claimed, 0);
  assert.equal(calls, 0);
});

test("reclaims an expired lease and publishes exactly once", async () => {
  const store = createMemoryStore();
  await enqueue(store, [{ id: "e1", type: "tenant.created", occurredAt: T0 }]);
  await store.transaction((tx) =>
    tx.claimOutbox({
      workerId: "worker-a",
      limit: 1,
      at: T0,
      leaseUntil: T1,
    }),
  );
  let calls = 0;
  const publisher = createOutboxPublisher({
    store,
    transport: {
      async publish() {
        calls += 1;
      },
    },
    workerId: "worker-b",
    clock: clock([T1, T2]),
  });
  const result = await publisher.runOnce();
  assert.equal(result.published, 1);
  assert.equal(calls, 1);
  assert.equal(store.read().outbox[0].status, "published");
});
