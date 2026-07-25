import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import pg from "pg";

import { createPostgresObservability, createPostgresStore } from "../src/index.mjs";

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;

async function waitFor(predicate, message) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(20);
  }
  throw new Error(message);
}

test("observes PostgreSQL pool, queries, errors, latency and alert transitions", {
  skip: !connectionString,
  timeout: 60_000,
}, async (t) => {
  const rawPool = new Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: 5_000,
  });
  const delivered = [];
  const observability = createPostgresObservability({
    pool: rawPool,
    thresholds: {
      waiting: 1,
      utilization: 1,
      p95Ms: 5,
      errorRate: 0.5,
      minLatencySamples: 1,
      minErrorSamples: 1,
    },
    alertSink(event) {
      delivered.push(event);
    },
  });

  let first;
  let second;
  let queued;
  t.after(async () => {
    first?.release();
    second?.release();
    queued?.release();
    observability.close();
    await rawPool.end();
  });

  first = await observability.pool.connect();
  second = await observability.pool.connect();
  const pending = observability.pool.connect();
  await waitFor(() => rawPool.waitingCount === 1, "third connection did not queue");

  const saturated = observability.snapshot();
  assert.equal(saturated.pool.active, 2);
  assert.equal(saturated.pool.waiting, 1);
  assert.deepEqual(
    saturated.alerts.active.map(({ code }) => code).sort(),
    ["postgres_pool_utilization", "postgres_pool_waiting"],
  );

  first.release();
  first = null;
  queued = await pending;
  queued.release();
  queued = null;
  second.release();
  second = null;
  await waitFor(() => rawPool.waitingCount === 0 && rawPool.idleCount >= 1, "pool did not recover");

  await assert.rejects(
    () => observability.pool.query("SELECT FROM"),
    (error) => typeof error?.code === "string",
  );
  assert.equal(
    observability.snapshot().alerts.active.some(({ code }) => code === "postgres_query_error_rate"),
    true,
  );

  await Promise.all([
    observability.pool.query("SELECT 1"),
    observability.pool.query("SELECT 2"),
    observability.pool.query("SELECT 3"),
  ]);
  assert.equal(
    observability.snapshot().alerts.active.some(({ code }) => code === "postgres_query_error_rate"),
    false,
  );

  const namespace = `observability_${Date.now()}_${process.pid}`;
  const store = createPostgresStore({ pool: observability.pool, namespace });
  await store.initialize();
  assert.equal((await store.read()).revision, 0);

  await store.executeIdempotent("observability-request-1", async (tx) => {
    tx.enqueueOutbox({
      id: "observability-event-1",
      type: "observability.completed",
      aggregateId: namespace,
      payload: { namespace },
    });
    return { accepted: true };
  });
  const replay = await store.executeIdempotent("observability-request-1", async () => {
    throw new Error("idempotent callback must not execute twice");
  });
  assert.equal(replay.result.executed, false);

  await Promise.all(
    Array.from({ length: 8 }, () => observability.pool.query("SELECT pg_sleep(0.02)")),
  );

  const snapshot = observability.snapshot();
  assert.equal(snapshot.pool.waiting, 0);
  assert.equal(snapshot.operations.connect.failed, 0);
  assert.equal(snapshot.operations.query.failed, 1);
  assert.equal(snapshot.errors.total, 1);
  assert.equal(snapshot.errors.byCode["42601"], 1);
  assert.ok(snapshot.queries.byCommand.select.total >= 8);
  assert.ok(snapshot.queries.byCommand.begin.total >= 1);
  assert.ok(snapshot.queries.byCommand.commit.total >= 1);
  assert.equal(snapshot.alerts.sinkFailures, 0);
  assert.equal(
    snapshot.alerts.active.some(({ code }) => code === "postgres_query_latency_p95"),
    true,
  );

  const events = observability.listAlertEvents({ limit: 128 });
  assert.equal(delivered.length, events.length);
  assert.equal(Object.isFrozen(events), true);
  assert.equal(Object.isFrozen(events[0]), true);

  for (const code of [
    "postgres_pool_waiting",
    "postgres_pool_utilization",
    "postgres_query_error_rate",
  ]) {
    const statuses = events.filter((event) => event.code === code).map((event) => event.status);
    assert.ok(statuses.includes("opened"), `${code} did not open`);
    assert.ok(statuses.includes("resolved"), `${code} did not resolve`);
  }
  assert.ok(events.some(
    (event) => event.code === "postgres_query_latency_p95" && event.status === "opened",
  ));
});
