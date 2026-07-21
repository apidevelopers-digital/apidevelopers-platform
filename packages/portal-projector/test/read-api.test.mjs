import test from "node:test";
import assert from "node:assert/strict";

import {
  PortalInstitutionalReadApiError,
  createPortalInstitutionalReadApi,
} from "../src/read-api.mjs";

const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);

function snapshot(commit, records = []) {
  return {
    sourceRepository: "sitedauni/apidevelopers-platform",
    sourceCommit: commit,
    contentChecksum: commit[0].repeat(64),
    documentCount: 2,
    recordCount: records.length,
    counts: { Node: records.filter((item) => item.institutionalType === "Node").length },
    integrity: { status: "in_sync", findingCount: 0 },
    records,
  };
}

function fixture() {
  const versions = [
    snapshot(COMMIT_B, [
      { institutionalType: "Relation", institutionalId: "REL-2" },
      { institutionalType: "Node", institutionalId: "NODE-2" },
      { institutionalType: "Node", institutionalId: "NODE-1" },
    ]),
    snapshot(COMMIT_A, [{ institutionalType: "Node", institutionalId: "NODE-A" }]),
  ];
  const byCommit = new Map(versions.map((item) => [item.sourceCommit, item]));
  return {
    reader: Object.freeze({
      readCurrent: () => byCommit.get(COMMIT_B),
      readByCommit: (commit) => byCommit.get(commit) ?? null,
      listVersions: () =>
        versions.map(({ sourceCommit, contentChecksum }) => ({
          sourceCommit,
          contentChecksum,
        })),
      mutationAllowed: false,
    }),
  };
}

test("exposes only read operations", () => {
  const api = createPortalInstitutionalReadApi(fixture());
  assert.equal(api.mutationAllowed, false);
  assert.equal("publish" in api, false);
  assert.equal(typeof api.getSnapshot, "function");
});

test("returns current and historical snapshots as defensive clones", () => {
  const api = createPortalInstitutionalReadApi(fixture());
  const current = api.getSnapshot();
  const historical = api.getSnapshot({ commit: COMMIT_A });
  assert.equal(current.sourceCommit, COMMIT_B);
  assert.equal(historical.sourceCommit, COMMIT_A);
  current.records[0].institutionalId = "MUTATED";
  assert.equal(api.getSnapshot().records[0].institutionalId, "REL-2");
});

test("returns compact deterministic summaries", () => {
  const api = createPortalInstitutionalReadApi(fixture());
  assert.deepEqual(api.getSummary(), {
    sourceRepository: "sitedauni/apidevelopers-platform",
    sourceCommit: COMMIT_B,
    contentChecksum: "b".repeat(64),
    documentCount: 2,
    recordCount: 3,
    counts: { Node: 2 },
    integrity: { status: "in_sync", findingCount: 0 },
  });
});

test("lists records in deterministic order with filtering and pagination", () => {
  const api = createPortalInstitutionalReadApi(fixture());
  const page = api.listRecords({ institutionalType: "Node", offset: 1, limit: 1 });
  assert.deepEqual(page.items, [
    { institutionalType: "Node", institutionalId: "NODE-2" },
  ]);
  assert.deepEqual(page.page, {
    offset: 1,
    limit: 1,
    total: 2,
    hasMore: false,
  });
});

test("gets one institutional record by type and id", () => {
  const api = createPortalInstitutionalReadApi(fixture());
  assert.deepEqual(
    api.getRecord({ institutionalType: "Node", institutionalId: "NODE-1" }),
    { institutionalType: "Node", institutionalId: "NODE-1" },
  );
  assert.equal(
    api.getRecord({ institutionalType: "Node", institutionalId: "UNKNOWN" }),
    null,
  );
});

test("lists versions deterministically with stable pagination", () => {
  const api = createPortalInstitutionalReadApi(fixture());
  const page = api.listVersions({ offset: 0, limit: 1 });
  assert.equal(page.items[0].sourceCommit, COMMIT_A);
  assert.deepEqual(page.page, {
    offset: 0,
    limit: 1,
    total: 2,
    hasMore: true,
  });
});

test("returns empty results when no projection was published", () => {
  const api = createPortalInstitutionalReadApi({
    reader: Object.freeze({
      readCurrent: () => null,
      readByCommit: () => null,
      listVersions: () => [],
      mutationAllowed: false,
    }),
  });
  assert.equal(api.getSnapshot(), null);
  assert.equal(api.getSummary(), null);
  assert.deepEqual(api.listRecords().items, []);
});

test("rejects mutable readers and invalid query parameters", () => {
  assert.throws(
    () =>
      createPortalInstitutionalReadApi({
        reader: {
          readCurrent() {},
          readByCommit() {},
          listVersions() {},
          mutationAllowed: true,
        },
      }),
    (error) =>
      error instanceof PortalInstitutionalReadApiError &&
      error.code === "PORTAL_READ_API_READER_INVALID",
  );

  const api = createPortalInstitutionalReadApi(fixture());
  assert.throws(
    () => api.getSnapshot({ commit: "main" }),
    (error) => error.code === "PORTAL_READ_API_COMMIT_INVALID",
  );
  assert.throws(
    () => api.listRecords({ limit: 201 }),
    (error) => error.code === "PORTAL_READ_API_LIMIT_INVALID",
  );
});
