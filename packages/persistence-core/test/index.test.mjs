import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  PersistenceDomainError,
  createDurableRepository,
  createJsonFileStore,
} from "../src/index.mjs";

const at = "2026-07-20T20:00:00.000Z";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "apid-persistence-"));
  const filePath = join(directory, "state.json");
  let tick = 0;
  const options = {
    filePath,
    clock: () =>
      new Date(Date.parse(at) + tick++ * 1_000).toISOString(),
    idFactory: () => `tmp-${tick}`,
  };
  return {
    directory,
    filePath,
    store: createJsonFileStore(options),
    reopen: () => createJsonFileStore(options),
  };
}

test("persists atomically and survives reopening", async (t) => {
  const { directory, store, reopen } = await fixture();
  t.after(() => rm(directory, { recursive: true, force: true }));

  const committed = await store.transaction((tx) => {
    tx.put("tenants", "tenant-1", { id: "tenant-1", status: "active" });
    return { ok: true };
  });

  assert.equal(committed.revision, 1);
  const state = await reopen().read();
  assert.equal(state.revision, 1);
  assert.equal(state.collections.tenants["tenant-1"].status, "active");
  assert.throws(() => {
    state.collections.tenants["tenant-1"].status = "changed";
  }, TypeError);
});

test("rolls back the complete transaction when work fails", async (t) => {
  const { directory, store } = await fixture();
  t.after(() => rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    store.transaction((tx) => {
      tx.put("projects", "project-1", { id: "project-1" });
      tx.enqueueOutbox({
        id: "event-1",
        type: "project.created",
      });
      throw new Error("boom");
    }),
    /boom/,
  );

  const state = await store.read();
  assert.equal(state.revision, 0);
  assert.deepEqual(state.collections, {});
  assert.deepEqual(state.outbox, []);
});

test("enforces optimistic concurrency by durable revision", async (t) => {
  const { directory, store } = await fixture();
  t.after(() => rm(directory, { recursive: true, force: true }));

  await store.transaction((tx) => tx.put("records", "1", { id: "1" }));

  await assert.rejects(
    store.transaction(
      (tx) => tx.put("records", "2", { id: "2" }),
      { expectedRevision: 0 },
    ),
    (error) =>
      error instanceof PersistenceDomainError &&
      error.code === "persistence_revision_conflict" &&
      error.details.actualRevision === 1,
  );

  assert.equal((await store.read()).revision, 1);
});

test("executes idempotent transactional work only once", async (t) => {
  const { directory, store } = await fixture();
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;

  const first = await store.executeIdempotent("checkout-1", (tx) => {
    calls += 1;
    tx.put("subscriptions", "sub-1", { id: "sub-1", status: "active" });
    return { subscriptionId: "sub-1" };
  });
  const second = await store.executeIdempotent("checkout-1", () => {
    calls += 1;
    return { subscriptionId: "should-not-run" };
  });

  assert.equal(first.result.executed, true);
  assert.equal(second.result.executed, false);
  assert.deepEqual(second.result.value, { subscriptionId: "sub-1" });
  assert.equal(calls, 1);
  assert.equal((await store.read()).revision, 2);
});

test("commits records and outbox entries in the same transaction", async (t) => {
  const { directory, store } = await fixture();
  t.after(() => rm(directory, { recursive: true, force: true }));

  await store.transaction((tx) => {
    tx.put("entitlements", "ent-1", { id: "ent-1", revision: 1 });
    tx.enqueueOutbox({
      id: "out-1",
      type: "entitlement.materialized",
      aggregateId: "ent-1",
      payload: { revision: 1 },
    });
  });

  let state = await store.read();
  assert.equal(state.collections.entitlements["ent-1"].revision, 1);
  assert.equal(state.outbox[0].status, "pending");

  await store.transaction((tx) =>
    tx.markOutboxPublished("out-1", {
      publishedAt: "2026-07-20T20:05:00.000Z",
    }),
  );
  state = await store.read();
  assert.equal(state.outbox[0].status, "published");
  assert.equal(state.outbox[0].attempts, 1);
});

test("detects checksum corruption and fails closed", async (t) => {
  const { directory, filePath, store } = await fixture();
  t.after(() => rm(directory, { recursive: true, force: true }));

  await store.transaction((tx) =>
    tx.put("usage", "usage-1", { id: "usage-1", quantity: 1 }),
  );

  const envelope = JSON.parse(await readFile(filePath, "utf8"));
  envelope.payload.collections.usage["usage-1"].quantity = 999;
  await writeFile(filePath, JSON.stringify(envelope), "utf8");

  await assert.rejects(
    store.read(),
    (error) =>
      error instanceof PersistenceDomainError &&
      error.code === "persistence_checksum_mismatch",
  );
});

test("durable repository isolates collections and supports filters", async (t) => {
  const { directory, store } = await fixture();
  t.after(() => rm(directory, { recursive: true, force: true }));

  const projects = createDurableRepository({
    store,
    collection: "projects",
  });
  const tenants = createDurableRepository({
    store,
    collection: "tenants",
  });

  await projects.create({ id: "project-2", tenantId: "tenant-1" });
  await projects.create({ id: "project-1", tenantId: "tenant-1" });
  await projects.create({ id: "project-3", tenantId: "tenant-2" });
  await tenants.create({ id: "tenant-1", status: "active" });

  assert.deepEqual(
    (await projects.list({ where: { tenantId: "tenant-1" } })).map(
      ({ id }) => id,
    ),
    ["project-1", "project-2"],
  );
  assert.equal((await tenants.getById("tenant-1")).status, "active");
  assert.equal(await projects.getById("tenant-1"), null);
});

test("serializes concurrent transactions without lost updates", async (t) => {
  const { directory, store } = await fixture();
  t.after(() => rm(directory, { recursive: true, force: true }));

  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      store.transaction(async (tx) => {
        const counter = tx.get("counters", "main") ?? { value: 0 };
        await new Promise((resolve) => setTimeout(resolve, index % 3));
        tx.put("counters", "main", { value: counter.value + 1 });
      }),
    ),
  );

  const state = await store.read();
  assert.equal(state.collections.counters.main.value, 12);
  assert.equal(state.revision, 12);
});

test("rejects non-JSON values before replacing the durable state", async (t) => {
  const { directory, store } = await fixture();
  t.after(() => rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    store.transaction((tx) =>
      tx.put("invalid", "1", {
        id: "1",
        callback() {},
      }),
    ),
    (error) =>
      error instanceof PersistenceDomainError &&
      error.code === "non_json_value",
  );

  assert.equal((await store.read()).revision, 0);
});
