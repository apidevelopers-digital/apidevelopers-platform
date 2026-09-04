import assert from "node:assert/strict";
import test from "node:test";

import {
  BROWSER_SESSION_HANDOFF_COLLECTION,
  createPersistenceBackedBrowserSessionHandoffStore,
} from "../src/browser-session-handoff-persistence.mjs";

function createSerialFakePersistenceStore() {
  const state = { collections: {} };
  let tail = Promise.resolve();

  function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
  }

  function collection(name) {
    state.collections[name] ??= {};
    return state.collections[name];
  }

  return {
    state,
    async transaction(work) {
      const run = async () => {
        const draft = structuredClone(state);
        const tx = {
          get(collectionName, id) {
            const records = draft.collections[collectionName] ?? {};
            return records[id] === undefined ? null : clone(records[id]);
          },
          put(collectionName, id, value, { ifAbsent = false } = {}) {
            draft.collections[collectionName] ??= {};
            const records = draft.collections[collectionName];
            if (ifAbsent && records[id] !== undefined) {
              throw new Error("record_conflict");
            }
            records[id] = clone(value);
            return clone(value);
          },
          delete(collectionName, id) {
            draft.collections[collectionName] ??= {};
            const records = draft.collections[collectionName];
            const existed = records[id] !== undefined;
            delete records[id];
            return existed;
          },
        };

        const result = await work(tx);
        state.collections = draft.collections;
        return { result, revision: 1 };
      };

      const next = tail.then(run, run);
      tail = next.then(() => undefined, () => undefined);
      return next;
    },
  };
}

test("uses persistence-core transactions for putIfAbsent and atomic take", async () => {
  const persistenceStore = createSerialFakePersistenceStore();
  const store = createPersistenceBackedBrowserSessionHandoffStore({ persistenceStore });

  assert.equal(store.kind, "persistence-core");
  assert.equal(store.collection, BROWSER_SESSION_HANDOFF_COLLECTION);

  const value = { status: "active", principal: { id: "acct_123" } };

  assert.equal(await store.putIfAbsent("key-1", value), true);
  assert.equal(await store.putIfAbsent("key-1", { other: true }), false);

  const taken = await store.take("key-1");
  assert.deepEqual(taken, value);
  assert.equal(await store.take("key-1"), null);
});

test("concurrent putIfAbsent allows exactly one winner", async () => {
  const persistenceStore = createSerialFakePersistenceStore();
  const store = createPersistenceBackedBrowserSessionHandoffStore({ persistenceStore });

  const results = await Promise.all([
    store.putIfAbsent("race-key", { owner: "left" }),
    store.putIfAbsent("race-key", { owner: "right" }),
  ]);

  assert.equal(results.filter(Boolean).length, 1);

  const taken = await store.take("race-key");
  assert.ok(["left", "right"].includes(taken.owner));
  assert.equal(await store.take("race-key"), null);
});

test("concurrent take returns the record to exactly one caller", async () => {
  const persistenceStore = createSerialFakePersistenceStore();
  const store = createPersistenceBackedBrowserSessionHandoffStore({ persistenceStore });

  await store.putIfAbsent("single-use", { value: 42 });

  const results = await Promise.all([
    store.take("single-use"),
    store.take("single-use"),
  ]);

  assert.equal(results.filter((value) => value !== null).length, 1);
  assert.equal(results.filter((value) => value === null).length, 1);
});

test("fails closed when persistence transaction contract is malformed", async () => {
  assert.throws(
    () => createPersistenceBackedBrowserSessionHandoffStore({ persistenceStore: {} }),
    /transaction is required/,
  );

  const badStore = createPersistenceBackedBrowserSessionHandoffStore({
    persistenceStore: {
      async transaction() {
        return null;
      },
    },
  });

  await assert.rejects(
    badStore.putIfAbsent("key", { value: true }),
    /must resolve \{ result \}/,
  );
  await assert.rejects(
    badStore.take("key"),
    /must resolve \{ result \}/,
  );
});