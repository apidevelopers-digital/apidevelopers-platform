import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProjection,
  canonicalSerialize,
  createPortalProjector,
  publishAtomically,
  reconcile,
  sha256,
} from "../src/index.mjs";

const COMMIT = "d2e601cf1c2ff73e2b4d7f4c7539874db147e44a";

function fixture(records = [
  {
    id: "NODE-002",
    type: "node",
    name: "Beta",
    sourceRef: { path: "docs/b.md", commit: COMMIT, checksum: "b" },
  },
  {
    id: "NODE-001",
    type: "node",
    name: "Alpha",
    sourceRef: { path: "docs/a.md", commit: COMMIT, checksum: "a" },
  },
]) {
  const byPath = new Map();
  for (const record of records) {
    const path = record.sourceRef.path;
    byPath.set(path, [...(byPath.get(path) ?? []), record]);
  }
  return {
    repository: "sitedauni/apidevelopers-platform",
    commit: COMMIT,
    sources: [...byPath].map(([path, sourceRecords]) => ({
      path,
      records: sourceRecords,
      checksum: sha256(sourceRecords),
    })),
  };
}

test("canonical serialization is stable across object key order", () => {
  assert.equal(
    canonicalSerialize({ b: 2, a: { d: 4, c: 3 } }),
    canonicalSerialize({ a: { c: 3, d: 4 }, b: 2 }),
  );
});

test("same fixed commit and content produce the same projection checksum", () => {
  const one = buildProjection(fixture());
  const two = buildProjection(fixture().sources.reverse() && fixture());
  assert.equal(one.contentChecksum, two.contentChecksum);
  assert.deepEqual(one.records.map((record) => record.id), ["NODE-001", "NODE-002"]);
});

test("semantic content change changes the checksum", () => {
  const original = buildProjection(fixture());
  const changed = fixture();
  changed.sources[0].records[0].name = "Changed";
  changed.sources[0].checksum = sha256(changed.sources[0].records);
  assert.notEqual(original.contentChecksum, buildProjection(changed).contentChecksum);
});

test("invalid source checksum and duplicate ids are rejected", () => {
  const invalid = fixture();
  invalid.sources[0].checksum = "bad";
  assert.throws(() => buildProjection(invalid), /checksum mismatch/i);

  const duplicate = fixture([
    { id: "NODE-001", type: "node", sourceRef: { path: "docs/a.md", commit: COMMIT, checksum: "a" } },
    { id: "NODE-001", type: "node", sourceRef: { path: "docs/b.md", commit: COMMIT, checksum: "b" } },
  ]);
  assert.throws(() => buildProjection(duplicate), /duplicate record id/i);
});

test("mixed commit references are rejected", () => {
  const input = fixture();
  input.sources[0].records[0].sourceRef.commit = "a".repeat(40);
  input.sources[0].checksum = sha256(input.sources[0].records);
  assert.throws(() => buildProjection(input), /does not match fixed input/i);
});

test("reconciliation identifies stale and divergent projections", () => {
  const expected = buildProjection(fixture());
  assert.deepEqual(reconcile(expected, expected), { status: "in_sync", findings: [] });

  const observed = { ...expected, sourceCommit: "a".repeat(40), recordCount: 0 };
  const result = reconcile(expected, observed);
  assert.equal(result.status, "divergent");
  assert.equal(result.findings.length, 2);
});

test("atomic publication validates before activation", async () => {
  const events = [];
  const projection = buildProjection(fixture());
  const result = await publishAtomically(projection, {
    stage: async (value) => {
      events.push("stage");
      return value;
    },
    validate: async () => {
      events.push("validate");
      return true;
    },
    activate: async () => {
      events.push("activate");
      return "published";
    },
    audit: async () => events.push("audit"),
  });
  assert.equal(result, "published");
  assert.deepEqual(events, ["stage", "validate", "activate", "audit"]);
});

test("failed staging validation never activates", async () => {
  let activated = false;
  await assert.rejects(
    publishAtomically(buildProjection(fixture()), {
      stage: async (value) => value,
      validate: async () => false,
      activate: async () => {
        activated = true;
      },
    }),
    /failed validation/i,
  );
  assert.equal(activated, false);
});

test("projector advertises read-only canonical behavior", () => {
  const projector = createPortalProjector();
  assert.equal(projector.mutationAllowed, false);
});
