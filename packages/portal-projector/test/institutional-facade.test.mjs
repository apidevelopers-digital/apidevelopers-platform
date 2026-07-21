import test from "node:test";
import assert from "node:assert/strict";

import {
  createPortalInstitutionalFacade,
  projectPortalInstitutionalState,
} from "../src/institutional-facade.mjs";

const COMMIT = "a3e34fdbdae4e349bebf1821009cdec9f98c94ff";

function fixture(overrides = {}) {
  const calls = [];
  const reader = { commit: COMMIT, mutationAllowed: false };
  const documentProjection = {
    sourceRepository: "sitedauni/apidevelopers-platform",
    sourceCommit: COMMIT,
    contentChecksum: "d".repeat(64),
    documentCount: 2,
    records: [],
  };
  const typedProjection = {
    sourceRepository: "sitedauni/apidevelopers-platform",
    sourceCommit: COMMIT,
    contentChecksum: "t".repeat(64),
    recordCount: 1,
    counts: { Node: 1 },
    records: [{ institutionalType: "Node", institutionalId: "NODE-1" }],
  };
  const integrity = {
    sourceCommit: COMMIT,
    status: "in_sync",
    checkedRecordCount: 1,
    findingCount: 0,
    findings: [],
  };

  return {
    reader,
    calls,
    documentProjector: async ({ reader: observedReader }) => {
      calls.push("document");
      assert.equal(observedReader, reader);
      return structuredClone(overrides.documentProjection ?? documentProjection);
    },
    typedExtractor: async (observedDocument) => {
      calls.push("typed");
      assert.equal(observedDocument.sourceCommit, COMMIT);
      return structuredClone(overrides.typedProjection ?? typedProjection);
    },
    integrityValidator: async (observedTyped) => {
      calls.push("integrity");
      assert.equal(observedTyped.sourceCommit, COMMIT);
      return structuredClone(overrides.integrity ?? integrity);
    },
  };
}

test("runs document, typed and integrity stages in order", async () => {
  const f = fixture();
  const result = await projectPortalInstitutionalState(f);
  assert.deepEqual(f.calls, ["document", "typed", "integrity"]);
  assert.equal(result.sourceCommit, COMMIT);
  assert.equal(result.integrity.status, "in_sync");
  assert.match(result.contentChecksum, /^[0-9a-f]{64}$/);
});

test("is deterministic for the same stage outputs", async () => {
  const one = fixture();
  const two = fixture();
  const first = await projectPortalInstitutionalState(one);
  const second = await projectPortalInstitutionalState(two);
  assert.deepEqual(first, second);
});

test("rejects readers that are not explicitly read-only", async () => {
  const f = fixture();
  f.reader.mutationAllowed = true;
  await assert.rejects(
    projectPortalInstitutionalState(f),
    (error) => error.code === "PORTAL_INSTIUTIONAL_FACADE_READER_INVALID",
   );
});

test("rejects commit drift between document and typed stages", async () => {
  const f = fixture({
    typedProjection: {
      sourceCommit: "b".repeat(40),
      contentChecksum: "t".repeat(64),
      recordCount: 0,
      counts: {},
      records: [],
    },
  });
  await assert.rejects(
    projectPortalInstitutionalState(f),
    (error) =>
      error.code === "PORTAL_INSTITUTIONAL_FACADE_COMMIT_MISMATCH" &&
      error.details.stage === "typed",
  );
});

test("rejects commit drift in integrity result", async () => {
  const f = fixture({
    integrity: {
      sourceCommit: "b".repeat(40),
      status: "in_sync",
      checkedRecordCount: 0,
      findingCount: 0,
    },
  });
  await assert.rejects(
    projectPortalInstitutionalState(f),
    (error) =>
      error.code === "PORTAL_INSTITUTIONAL_FACADE_COMMIT_MISMATCH" &&
      error.details.stage === "integrity",
  );
});

test("fails closed when typed integrity is not in sync", async () => {
  const f = fixture({
    integrity: {
      sourceCommit: COMMIT,
      status: "invalid",
      checkedRecordCount: 1,
      findingCount: 1,
      findings: [{ code: "BROKEN" }],
    },
  });
  await assert.rejects(
    projectPortalInstitutionalState(f),
    (error) =>
      error.code === "PORTAL_INSTITUTIONAL_FACADE_INTEGRITY_INVALID",
   );
});

test("facade exposes only projection and read-only intent", async () => {
  const f = fixture();
  const facade = createPortalInstitutionalFacade({
    documentProjector: f.documentProjector,
    typedExtractor: f.typedExtractor,
    integrityValidator: f.integrityValidator,
  });
  assert.equal(facade.mutationAllowed, false);
  assert.equal(typeof facade.project, "function");
  assert.equal("write" in facade, false);
  const result = await facade.project(f.reader);
  assert.equal(result.sourceCommit, COMMIT);
});
