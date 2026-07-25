import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildPostgresSchemaSql,
  createDurableRepository,
  createJsonFileStore,
  createEmptyPersistenceState,
  decodePersistenceState,
  encodePersistenceState,
} from "../src/index.mjs";

test("encodes and decodes a checksummed persistence state", () => {
  const state = createEmptyPersistenceState();
  const encoded = encodePersistenceState(state);
  const decoded = decodePersistenceState(encoded);

  assert.equal(decoded.schemaVersion, 1);
  assert.equal(decoded.revision, 0);
  assert.deepEqual(decoded.collections, {});
  assert.deepEqual(decoded.outbox, []);
  assert.equal(Object.isFrozen(decoded), true);
});

test("rejects a modified persistence payload", () => {
  const state = createEmptyPersistenceState();
  const envelope = JSON.parse(encodePersistenceState(state));
  envelope.payload.revision = 99;

  assert.throws(
    () => decodePersistenceState(JSON.stringify(envelope)),
    (error) => error?.code === "persistence_checksum_mismatch",
  );
});

test("persists repository records atomically and filters lists", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "apidev-persistence-"));
  const filePath = path.join(directory, "state.json");

  try {
    const store = createJsonFileStore({
      filePath,
      fsync: false,
      clock: () => "2026-07-25T00:00:00.000Z",
      idFactory: () => "tmp",
    });
    const repository = createDurableRepository({
      store,
      collection: "projects",
    });

    await repository.create({ id: "p1", tenantId: "t1", name: "Alpha" });
    await repository.create({ id: "p2", tenantId: "t2", name: "Beta" });

    assert.deepEqual(await repository.getById("p1"), {
      id: "p1",
      tenantId: "t1",
      name: "Alpha",
    });
    assert.deepEqual(
      await repository.list({ where: { tenantId: "t1" } }),
      [{ id: "p1", tenantId: "t1", name: "Alpha" }],
    );

    const persisted = await store.read();
    assert.equal(persisted.revision, 2);
    assert.equal(persisted.collections.projects.p2.name, "Beta");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executes idempotent work once and records an outbox entry", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "apidev-idempotency-"));
  const filePath = path.join(directory, "state.json");

  try {
    const store = createJsonFileStore({
      filePath,
      fsync: false,
      clock: () => "2026-07-25T00:00:00.000Z",
      idFactory: () => "tmp",
    });

    const first = await store.executeIdempotent("request-1", async (tx) => {
      tx.enqueueOutbox({
        id: "event-1",
        type: "project.created",
        aggregateId: "p1",
        payload: { projectId: "p1" },
      });
      return { accepted: true };
    });
    const second = await store.executeIdempotent("request-1", async () => {
      throw new Error("must not execute twice");
    });

    assert.equal(first.result.executed, true);
    assert.equal(second.result.executed, false);

    const state = await store.read();
    assert.equal(state.outbox.length, 1);
    assert.equal(state.outbox[0].status, "pending");
    assert.equal(state.idempotency["request-1"].value.accepted, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("builds a constrained PostgreSQL schema", () => {
  const sql = buildPostgresSchemaSql({
    schema: "public",
    tableName: "apidev_persistence_state",
  });
  assert.match(sql, /CREATE TABLE IF NOT EXISTS/);
  assert.match(sql, /JSONB NOT NULL/);
  assert.throws(
    () => buildPostgresSchemaSql({ schema: "Public" }),
    (error) => error?.code === "invalid_postgres_identifier",
  );
});
