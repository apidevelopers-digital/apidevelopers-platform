import assert from "node:assert/strict";
import test from "node:test";

import {
  PersistenceDomainError,
  checksum,
} from "../src/model.mjs";
import {
  buildPostgresSchemaSql,
  createPostgresStore,
} from "../src/postgres-store.mjs";

const T0 = "2026-07-21T01:00:00.000Z";

function createFakePool() {
  const database = new Map();
  const queries = [];
  let failNext = null;

  function copyRows(source) {
    return new Map([...source].map(([key, value]) => [key, structuredClone(value)]));
  }

  return {
    database,
    queries,
    fail(code) {
      failNext = Object.assign(new Error(`postgres ${code}`), { code });
    },
    async connect() {
      let transactionRows = null;
      let inTransaction = false;
      return {
        async query(text, params = []) {
          const sql = String(text).trim();
          queries.push({ sql, params: structuredClone(params) });
          if (failNext) {
            const error = failNext;
            failNext = null;
            throw error;
          }
          if (sql.startsWith("CREATE TABLE")) return { rows: [], rowCount: 0 };
          if (sql === "BEGIN") {
            inTransaction = true;
            transactionRows = copyRows(database);
            return { rows: [], rowCount: 0 };
          }
          if (sql === "COMMIT") {
            database.clear();
            for (const [key, value] of transactionRows) database.set(key, value);
            inTransaction = false;
            return { rows: [], rowCount: 0 };
          }
          if (sql === "ROLLBACK") {
            inTransaction = false;
            transactionRows = null;
            return { rows: [], rowCount: 0 };
          }
          if (sql.startsWith("SET TRANSACTION") || sql.startsWith("SELECT pg_advisory")) {
            return { rows: [], rowCount: 0 };
          }

          const rows = inTransaction ? transactionRows : database;
          if (sql.startsWith("SELECT revision")) {
            const row = rows.get(params[0]);
            return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
          }
          if (sql.startsWith("INSERT INTO")) {
            const [namespace, revision, payload, digest, updatedAt] = params;
            if (rows.has(namespace)) {
              throw Object.assign(new Error("duplicate"), { code: "23505" });
            }
            rows.set(namespace, {
              revision,
              payload: JSON.parse(payload),
              checksum: digest,
              updated_at: updatedAt,
            });
            return { rows: [{ revision }], rowCount: 1 };
          }
          if (sql.startsWith("UPDATE")) {
            const [namespace, revision, payload, digest, updatedAt, expected] = params;
            const current = rows.get(namespace);
            if (!current || Number(current.revision) !== Number(expected)) {
              return { rows: [], rowCount: 0 };
            }
            rows.set(namespace, {
              revision,
              payload: JSON.parse(payload),
              checksum: digest,
              updated_at: updatedAt,
            });
            return { rows: [{ revision }], rowCount: 1 };
          }
          throw new Error(`Unsupported SQL: ${sql}`);
        },
        release() {},
      };
    },
  };
}

function fixture(options = {}) {
  const pool = createFakePool();
  const store = createPostgresStore({
    pool,
    namespace: "tenant-a",
    clock: () => T0,
    ...options,
  });
  return { pool, store };
}

test("builds a safely quoted PostgreSQL schema", () => {
  const sql = buildPostgresSchemaSql({
    schema: "platform",
    tableName: "durable_state",
  });
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "platform"\."durable_state"/);
  assert.throws(
    () => buildPostgresSchemaSql({ tableName: "bad-name" }),
    (error) => error.code === "invalid_postgres_identifier",
  );
});

test("reads an empty state before the first transaction", async () => {
  const { store } = fixture();
  const state = await store.read();
  assert.equal(state.revision, 0);
  assert.deepEqual(state.collections, {});
  assert.throws(() => {
    state.collections.test = {};
  }, TypeError);
});

test("persists and reopens state through the shared pool", async () => {
  const { pool, store } = fixture();
  const committed = await store.transaction((tx) => {
    tx.put("tenants", "tenant-a", { id: "tenant-a", status: "active" });
    return { ok: true };
  });
  const reopened = createPostgresStore({
    pool,
    namespace: "tenant-a",
    clock: () => T0,
  });
  assert.equal(committed.revision, 1);
  assert.equal((await reopened.read()).collections.tenants["tenant-a"].status, "active");
});

test("rolls back all state when transaction work fails", async () => {
  const { store } = fixture();
  await assert.rejects(
    store.transaction((tx) => {
      tx.put("projects", "p1", { id: "p1" });
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.equal((await store.read()).revision, 0);
});

test("enforces expected durable revision", async () => {
  const { store } = fixture();
  await store.transaction((tx) => tx.put("records", "1", { id: "1" }));
  await assert.rejects(
    store.transaction((tx) => tx.put("records", "2", { id: "2" }), {
      expectedRevision: 0,
    }),
    (error) =>
      error instanceof PersistenceDomainError &&
      error.code === "persistence_revision_conflict" &&
      error.details.actualRevision === 1,
  );
});

test("executes idempotent work only once in the same durable transaction", async () => {
  const { store } = fixture();
  let calls = 0;
  const first = await store.executeIdempotent("checkout-1", (tx) => {
    calls += 1;
    tx.put("subscriptions", "s1", { id: "s1" });
    return { subscriptionId: "s1" };
  });
  const second = await store.executeIdempotent("checkout-1", () => {
    calls += 1;
    return { subscriptionId: "never" };
  });
  assert.equal(first.result.executed, true);
  assert.equal(second.result.executed, false);
  assert.deepEqual(second.result.value, { subscriptionId: "s1" });
  assert.equal(calls, 1);
  assert.equal((await store.read()).revision, 2);
});

test("fails closed when the persisted checksum is corrupted", async () => {
  const { pool, store } = fixture();
  await store.transaction((tx) => tx.put("usage", "u1", { id: "u1" }));
  pool.database.get("tenant-a").checksum = "0".repeat(64);
  await assert.rejects(
    store.read(),
    (error) => error.code === "persistence_checksum_mismatch",
  );
});

test("maps serialization and deadlock errors to retryable conflicts", async () => {
  const { pool, store } = fixture();
  await store.initialize();
  pool.fail("40001");
  await assert.rejects(
    store.transaction(() => null),
    (error) =>
      error.code === "persistence_retryable_conflict" &&
      error.details.postgresCode === "40001",
  );
});

test("uses serializable isolation, advisory lock and row lock in order", async () => {
  const { pool, store } = fixture();
  await store.transaction((tx) => tx.put("records", "1", { id: "1" }));
  const sequence = pool.queries.map(({ sql }) => sql);
  const serializable = sequence.findIndex((sql) => sql.startsWith("SET TRANSACTION"));
  const advisory = sequence.findIndex((sql) => sql.startsWith("SELECT pg_advisory"));
  const rowLock = sequence.findIndex((sql) => sql.includes("FOR UPDATE"));
  assert.ok(serializable >= 0);
  assert.ok(advisory > serializable);
  assert.ok(rowLock > advisory);
});

test("rejects a pool without the PostgreSQL connect contract", () => {
  assert.throws(
    () => createPostgresStore({ pool: {} }),
    (error) => error.code === "invalid_store",
  );
});
