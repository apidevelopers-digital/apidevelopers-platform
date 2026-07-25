import assert from "node:assert/strict";
import test from "node:test";

import pg from "pg";

import {
  createDurableRepository,
  createPostgresStore,
} from "../src/index.mjs";

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;

function createPool() {
  return new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: 5_000,
  });
}

test(
  "persists concurrent repository writes and idempotency across PostgreSQL reconnects",
  { skip: !connectionString },
  async (t) => {
    const namespace = `integration_${Date.now()}_${process.pid}`;
    const tableName = "apidev_persistence_state";
    const pools = [];

    t.after(async () => {
      await Promise.allSettled(pools.map((pool) => pool.end()));
    });

    const poolA = createPool();
    const poolB = createPool();
    pools.push(poolA, poolB);

    const storeA = createPostgresStore({
      pool: poolA,
      namespace,
      tableName,
    });
    const storeB = createPostgresStore({
      pool: poolB,
      namespace,
      tableName,
    });

    await Promise.all([storeA.initialize(), storeB.initialize()]);

    const repositoryA = createDurableRepository({
      store: storeA,
      collection: "projects",
    });
    const repositoryB = createDurableRepository({
      store: storeB,
      collection: "projects",
    });

    await Promise.all([
      repositoryA.create({
        id: "project-a",
        tenantId: "tenant-1",
        name: "Alpha",
      }),
      repositoryB.create({
        id: "project-b",
        tenantId: "tenant-1",
        name: "Beta",
      }),
    ]);

    const first = await storeA.executeIdempotent(
      "request-1",
      async (tx) => {
        tx.enqueueOutbox({
          id: "event-1",
          type: "integration.completed",
          aggregateId: namespace,
          payload: { namespace },
        });
        return { accepted: true };
      },
    );

    assert.equal(first.result.executed, true);
    assert.equal(first.result.value.accepted, true);

    await Promise.all([poolA.end(), poolB.end()]);
    pools.length = 0;

    const poolC = createPool();
    pools.push(poolC);
    const recoveredStore = createPostgresStore({
      pool: poolC,
      namespace,
      tableName,
    });
    const recoveredRepository = createDurableRepository({
      store: recoveredStore,
      collection: "projects",
    });

    const recovered = await recoveredRepository.list({
      where: { tenantId: "tenant-1" },
    });

    assert.deepEqual(
      recovered.map((record) => record.id).sort(),
      ["project-a", "project-b"],
    );

    const second = await recoveredStore.executeIdempotent(
      "request-1",
      async () => {
        throw new Error("idempotent callback must not execute after reconnect");
      },
    );

    assert.equal(second.result.executed, false);
    assert.deepEqual(second.result.value, { accepted: true });

    const state = await recoveredStore.read();
    assert.equal(state.outbox.length, 1);
    assert.equal(state.idempotency["request-1"].value.accepted, true);
    assert.ok(state.revision >= 3);
  },
);
