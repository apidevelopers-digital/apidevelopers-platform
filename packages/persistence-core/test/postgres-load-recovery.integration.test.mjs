import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import pg from "pg";

import {
  createDurableRepository,
  createPostgresStore,
} from "../src/index.mjs";

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;
const TRANSIENT_TRANSACTION_CODES = new Set(["40001", "40P01"]);

function createPool() {
  return new Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: 5_000,
  });
}

async function retryTransient(work, {
  attempts = 8,
  baseDelayMillis = 10,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (
        !TRANSIENT_TRANSACTION_CODES.has(String(error?.code)) ||
        attempt === attempts
      ) {
        throw error;
      }
      await delay(baseDelayMillis * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

async function waitFor(predicate, {
  timeoutMillis = 5_000,
  intervalMillis = 20,
  message = "condition was not met before timeout",
} = {}) {
  const deadline = Date.now() + timeoutMillis;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(intervalMillis);
  }
  throw new Error(message);
}

async function withTimeout(promise, timeoutMillis, message) {
  return Promise.race([
    promise,
    delay(timeoutMillis).then(() => {
      throw new Error(message);
    }),
  ]);
}

test(
  "sustains concurrent load, recovers from pool saturation and preserves durable state",
  {
    skip: !connectionString,
    timeout: 120_000,
  },
  async (t) => {
    const namespace = `load_${Date.now()}_${process.pid}`;
    const tableName = "apidev_persistence_state";
    const pools = [];
    let activePool = createPool();
    let heldClientA = null;
    let heldClientB = null;
    pools.push(activePool);

    t.after(async () => {
      heldClientA?.release();
      heldClientB?.release();
      heldClientA = null;
      heldClientB = null;
      await Promise.allSettled(pools.map((entry) => entry.end()));
    });

    let store = createPostgresStore({
      pool: activePool,
      namespace,
      tableName,
    });
    await store.initialize();

    let repository = createDurableRepository({
      store,
      collection: "projects",
    });

    heldClientA = await activePool.connect();
    heldClientB = await activePool.connect();
    let readSettled = false;
    const queuedRead = store.read().finally(() => {
      readSettled = true;
    });

    await waitFor(() => activePool.waitingCount === 1, {
      message: "store read did not queue while the pool was saturated",
    });
    await delay(100);
    assert.equal(readSettled, false);

    heldClientA.release();
    heldClientA = null;
    const recoveredRead = await withTimeout(
      queuedRead,
      5_000,
      "queued store read did not recover after a pool connection was released",
    );
    assert.equal(recoveredRead.revision, 0);

    heldClientB.release();
    heldClientB = null;
    await waitFor(
      () => activePool.waitingCount === 0 && activePool.idleCount >= 1,
      { message: "pool did not return to an idle recovered state" },
    );
    assert.equal(
      (await activePool.query("SELECT 1 AS healthy")).rows[0].healthy,
      1,
    );

    const recordCount = 40;
    await Promise.all(
      Array.from({ length: recordCount }, (_, index) =>
        retryTransient(() =>
          repository.create({
            id: `project-${String(index).padStart(3, "0")}`,
            tenantId: "tenant-load",
            sequence: index,
            name: `Project ${index}`,
          }),
        ),
      ),
    );

    let sharedCallbackExecutions = 0;
    const sharedAttempts = await Promise.all(
      Array.from({ length: 20 }, () =>
        store.executeIdempotent("shared-load-request", async (tx) => {
          sharedCallbackExecutions += 1;
          await delay(25);
          tx.enqueueOutbox({
            id: "shared-load-event",
            type: "load.shared.completed",
            aggregateId: namespace,
            payload: { namespace },
          });
          return { accepted: true, marker: "shared" };
        }),
      ),
    );

    assert.equal(sharedCallbackExecutions, 1);
    assert.equal(
      sharedAttempts.filter((entry) => entry.result.executed === true).length,
      1,
    );
    assert.equal(
      sharedAttempts.filter((entry) => entry.result.executed === false).length,
      19,
    );

    const uniqueIdempotencyCount = 20;
    await Promise.all(
      Array.from({ length: uniqueIdempotencyCount }, (_, index) =>
        retryTransient(() =>
          store.executeIdempotent(`unique-load-${index}`, async (tx) => {
            tx.enqueueOutbox({
              id: `unique-load-event-${index}`,
              type: "load.unique.completed",
              aggregateId: namespace,
              payload: { index },
            });
            return { accepted: true, index };
          }),
        ),
      ),
    );

    const sustainedDurationMillis = 20_000;
    const sustainedWorkers = 6;
    const sustainedKeys = Array.from(
      { length: sustainedWorkers },
      (_, index) => `steady-load-${index}`,
    );
    const sustainedCallbackExecutions = new Map(
      sustainedKeys.map((key) => [key, 0]),
    );

    await Promise.all(
      sustainedKeys.map((key, workerIndex) =>
        retryTransient(() =>
          store.executeIdempotent(key, async () => {
            sustainedCallbackExecutions.set(
              key,
              sustainedCallbackExecutions.get(key) + 1,
            );
            return { workerIndex, stable: true };
          }),
        ),
      ),
    );

    let sustainedOperations = 0;
    const startedAt = Date.now();
    const deadline = startedAt + sustainedDurationMillis;

    await Promise.all(
      sustainedKeys.map(async (key, workerIndex) => {
        while (Date.now() < deadline) {
          const iteration = sustainedOperations;
          if ((iteration + workerIndex) % 3 === 0) {
            const listed = await repository.list({
              where: { tenantId: "tenant-load" },
            });
            assert.equal(listed.length, recordCount);
          } else {
            const result = await store.executeIdempotent(key, async () => {
              throw new Error(
                `sustained idempotent callback must not re-execute for ${key}`,
              );
            });
            assert.equal(result.result.executed, false);
            assert.equal(result.result.value.stable, true);
          }
          sustainedOperations += 1;
          await delay(40);
        }
      }),
    );

    const elapsedMillis = Date.now() - startedAt;
    assert.ok(
      elapsedMillis >= sustainedDurationMillis,
      `sustained load ended too early: ${elapsedMillis}ms`,
    );
    assert.ok(
      sustainedOperations >= 100,
      `sustained load executed too few operations: ${sustainedOperations}`,
    );
    for (const executions of sustainedCallbackExecutions.values()) {
      assert.equal(executions, 1);
    }

    const beforeReconnect = await store.read();
    assert.equal(
      beforeReconnect.outbox.length,
      1 + uniqueIdempotencyCount,
    );
    assert.equal(
      Object.keys(beforeReconnect.idempotency).length,
      1 + uniqueIdempotencyCount + sustainedWorkers,
    );
    assert.equal(activePool.waitingCount, 0);

    await activePool.end();
    pools.splice(pools.indexOf(activePool), 1);

    activePool = createPool();
    pools.push(activePool);
    store = createPostgresStore({
      pool: activePool,
      namespace,
      tableName,
    });
    repository = createDurableRepository({
      store,
      collection: "projects",
    });

    const recoveredProjects = await repository.list({
      where: { tenantId: "tenant-load" },
    });
    assert.deepEqual(
      recoveredProjects.map(({ id }) => id).sort(),
      Array.from(
        { length: recordCount },
        (_, index) => `project-${String(index).padStart(3, "0")}`,
      ),
    );

    const replay = await store.executeIdempotent(
      "shared-load-request",
      async () => {
        throw new Error(
          "shared idempotent callback must not execute after pool reconnection",
        );
      },
    );
    assert.equal(replay.result.executed, false);
    assert.deepEqual(replay.result.value, {
      accepted: true,
      marker: "shared",
    });

    const afterReconnect = await store.read();
    assert.equal(
      afterReconnect.outbox.length,
      1 + uniqueIdempotencyCount,
    );
    assert.equal(
      Object.keys(afterReconnect.idempotency).length,
      1 + uniqueIdempotencyCount + sustainedWorkers,
    );
    assert.ok(afterReconnect.revision >= beforeReconnect.revision);
    assert.equal(
      (await activePool.query("SELECT 1 AS healthy")).rows[0].healthy,
      1,
    );
    assert.equal(activePool.waitingCount, 0);

    process.stdout.write(
      `${JSON.stringify({
        namespace,
        recordCount,
        sharedAttempts: sharedAttempts.length,
        sustainedWorkers,
        sustainedOperations,
        sustainedDurationMillis: elapsedMillis,
        finalRevision: afterReconnect.revision,
        poolMax: activePool.options.max,
      })}\n`,
    );
  },
);
