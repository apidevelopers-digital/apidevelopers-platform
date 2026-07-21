import test from "node:test";
import assert from "node:assert/strict";

import {
  PortalDerivedStoreError,
  createPortalDerivedStore,
} from "../src/derived-store.mjs";

const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);

function projection(sourceCommit, checksum = "c".repeat(64), extra = {}) {
  return {
    schemaVersion: "portal.institutional-state/v1",
    sourceCommit,
    contentChecksum: checksum,
    recordCount: 1,
    records: [{ id: "NODE-1" }],
    ...extra,
  };
}

test("publishes atomically and exposes a read-only view", () => {
  const store = createPortalDerivedStore();
  const result = store.publisher.publish(projection(COMMIT_A));

  assert.deepEqual(result, {
    sourceCommit: COMMIT_A,
    contentChecksum: "c".repeat(64),
    published: true,
  });
  assert.equal(store.reader.readCurrent().sourceCommit, COMMIT_A);
  assert.equal(store.reader.mutationAllowed, false);
  assert.equal("publish" in store.reader, false);
});

test("preserves immutable historical versions by commit", () => {
  const store = createPortalDerivedStore();
  store.publisher.publish(projection(COMMIT_A));
  store.publisher.publish(projection(COMMIT_B, "d".repeat(64)));

  assert.equal(store.reader.readCurrent().sourceCommit, COMMIT_B);
  assert.equal(store.reader.readByCommit(COMMIT_A).sourceCommit, COMMIT_A);
  assert.deepEqual(store.reader.listVersions(), [
    { sourceCommit: COMMIT_A, contentChecksum: "c".repeat(64) },
    { sourceCommit: COMMIT_B, contentChecksum: "d".repeat(64) },
  ]);
});

test("publishing identical content for the same commit is idempotent", () => {
  const store = createPortalDerivedStore();
  const first = store.publisher.publish(projection(COMMIT_A));
  const second = store.publisher.publish(projection(COMMIT_A));

  assert.equal(first.published, true);
  assert.equal(second.published, false);
  assert.equal(store.reader.listVersions().length, 1);
});

test("rejects different content for the same source commit", () => {
  const store = createPortalDerivedStore();
  store.publisher.publish(projection(COMMIT_A));

  assert.throws(
    () => store.publisher.publish(projection(COMMIT_A, "d".repeat(64))),
    (error) =>
      error instanceof PortalDerivedStoreError &&
      error.code === "PORTAL_DERIVED_STORE_COMMIT_COLLISION",
  );
});

test("detects optimistic publication conflicts", () => {
  const store = createPortalDerivedStore();
  store.publisher.publish(projection(COMMIT_A));

  assert.throws(
    () =>
      store.publisher.publish(projection(COMMIT_B, "d".repeat(64)), {
        expectedCurrentCommit: null,
      }),
    (error) =>
      error.code === "PORTAL_DERIVED_STORE_CONFLICT" &&
      error.details.observedCurrentCommit === COMMIT_A,
  );
});

test("stores a clone instead of a mutable caller reference", () => {
  const store = createPortalDerivedStore();
  const input = projection(COMMIT_A);
  store.publisher.publish(input);
  input.records[0].id = "MUTATED";

  assert.equal(store.reader.readCurrent().records[0].id, "NODE-1");
});

test("rejects invalid commits and checksums", () => {
  const store = createPortalDerivedStore();

  assert.throws(
    () => store.publisher.publish(projection("main")),
    (error) => error.code === "PORTAL_DERIVED_STORE_COMMIT_INVALID",
  );
  assert.throws(
    () => store.publisher.publish(projection(COMMIT_A, "invalid")),
    (error) => error.code === "PORTAL_DERIVED_STORE_CHECKSUM_INVALID",
  );
});

test("returns null before publication and for unknown commits", () => {
  const store = createPortalDerivedStore();

  assert.equal(store.reader.readCurrent(), null);
  assert.equal(store.reader.readByCommit(COMMIT_A), null);
});
