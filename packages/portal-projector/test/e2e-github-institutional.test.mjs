import test from "node:test";
import assert from "node:assert/strict";

import { createGitHubCommitReader } from "../src/github-provider.mjs";
import { projectPortalInstitutionalState } from "../src/institutional-facade.mjs";

const COMMIT = "1e8b15c60e94b6cb70a8326ea736eb74824f422c";
const PATH = "docs/architecture/PORTAL_DATA_MODEL.md";
const DOCUMENT = "# Portal Institutional Model\n\n```yaml\nrepository: sitedauni/apidevelopers-platform\ncommit: 1e8b15c60e94b6cb70a8326ea736eb74824f422c\npath: docs/architecture/PORTAL_DATA_MODEL.md\nchecksum: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n```\n\n```yaml\nid: NODE-1\ntype: capability\nname: Portal Projector\nstatus: validated\nowner: platform\nsource_ref:\n  commit: 1e8b15c60e94b6cb70a8326ea736eb74824f422c\n  path: docs/architecture/PORTAL_DATA_MODEL.md\n  checksum: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n```\n\n```yaml\nid: NODE-2\ntype: component\nname: GitHub Provider\nstatus: validated\nowner: platform\nsource_ref:\n  commit: 1e8b15c60e94b6cb70a8326ea736eb74824f422c\n  path: docs/architecture/PORTAL_DATA_MODEL.md\n  checksum: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n```\n\n```yaml\nid: REL-1\ntype: IMPLEMENTS\nfrom: NODE-2\nto: NODE-1\nsource_ref:\n  commit: 1e8b15c60e94b6cb70a8326ea736eb74824f422c\n  path: docs/architecture/PORTAL_DATA_MODEL.md\n  checksum: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n```\n\n```yaml\nid: EVD-1\ntype: test_run\nstatus: passed\nsubject_id: NODE-1\nsource_ref:\n  commit: 1e8b15c60e94b6cb70a8326ea736eb74824f422c\n  path: docs/architecture/PORTAL_DATA_MODEL.md\n  checksum: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n```\n\n```yaml\nid: STATE-1\nscope: portal\nstatus: active\nhead: 1e8b15c60e94b6cb70a8326ea736eb74824f422c\ncaptured_at: 2026-07-21T00:00:00Z\nsource_ref:\n  commit: 1e8b15c60e94b6cb70a8326ea736eb74824f422c\n  path: docs/architecture/PORTAL_DATA_MODEL.md\n  checksum: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n```\n\n```yaml\nid: ITER-1\ntitle: Portal integration\nstatus: validated\nscope:\n  - portal\nauthorized_actions:\n  - test\nforbidden_actions:\n  - deploy\nsource_ref:\n  commit: 1e8b15c60e94b6cb70a8326ea736eb74824f422c\n  path: docs/architecture/PORTAL_DATA_MODEL.md\n  checksum: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n```\n\n```yaml\nid: APR-1\naction_id: ACT-1\nstatus: approved\napproved_by: igor\napproved_at: 2026-07-21T00:00:00Z\nscope:\n  - test\nsource_ref:\n  commit: 1e8b15c60e94b6cb70a8326ea736eb74824f422c\n  path: docs/architecture/PORTAL_DATA_MODEL.md\n  checksum: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n```\n\n```yaml\nid: AUD-1\naction_id: ACT-1\nactor_id: igor\nresult: success\nexecuted_at: 2026-07-21T00:00:00Z\napproval_id: APR-1\nevidence_id: EVD-1\nsource_ref:\n  commit: 1e8b15c60e94b6cb70a8326ea736eb74824f422c\n  path: docs/architecture/PORTAL_DATA_MODEL.md\n  checksum: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n```\n";

function createTransport() {
  const calls = [];
  const request = async (input) => {
    calls.push(input);
    if (input.operation === "listTree") {
      return {
        status: 200,
        data: {
          truncated: false,
          tree: [{ path: PATH, type: "blob" }],
        },
      };
    }
    if (input.operation === "readBlob") {
      return {
        status: 200,
        data: {
          type: "file",
          encoding: "base64",
          content: Buffer.from(DOCUMENT, "utf8").toString("base64"),
        },
      };
    }
    throw new Error(`unexpected operation: ${input.operation}`);
  };
  return { request, calls };
}

test("projects institutional state end to end from GitHub transport", async () => {
  const { request, calls } = createTransport();
  const reader = createGitHubCommitReader({
    repository: "sitedauni/apidevelopers-platform",
    commit: COMMIT,
    request,
  });

  const result = await projectPortalInstitutionalState({
    reader,
    extractionOptions: { requireAllTypes: true },
  });

  assert.equal(result.sourceCommit, COMMIT);
  assert.equal(result.documentCount, 1);
  assert.equal(result.recordCount, 9);
  assert.equal(result.integrity.status, "in_sync");
  assert.equal(result.counts.SourceRef, 1);
  assert.equal(result.counts.Node, 2);
  assert.equal(result.counts.Relation, 1);
  assert.equal(result.counts.Evidence, 1);
  assert.equal(result.counts.StateSnapshot, 1);
  assert.equal(result.counts.Iteration, 1);
  assert.equal(result.counts.Approval, 1);
  assert.equal(result.counts.AuditEvent, 1);
  assert.match(result.contentChecksum, /^[0-9a-f]{64}$/);
  assert.equal(calls.every((call) => call.method === "GET"), true);
  assert.equal(calls.every((call) => call.url.includes(COMMIT)), true);
});

test("is deterministic across repeated end-to-end projections", async () => {
  const firstTransport = createTransport();
  const secondTransport = createTransport();
  const firstReader = createGitHubCommitReader({
    repository: "sitedauni/apidevelopers-platform",
    commit: COMMIT,
    request: firstTransport.request,
  });
  const secondReader = createGitHubCommitReader({
    repository: "sitedauni/apidevelopers-platform",
    commit: COMMIT,
    request: secondTransport.request,
  });

  const first = await projectPortalInstitutionalState({
    reader: firstReader,
    extractionOptions: { requireAllTypes: true },
  });
  const second = await projectPortalInstitutionalState({
    reader: secondReader,
    extractionOptions: { requireAllTypes: true },
  });

  assert.deepEqual(first, second);
});

test("fails closed when GitHub returns a truncated tree", async () => {
  const request = async (input) => {
    if (input.operation === "listTree") {
      return { status: 200, data: { truncated: true, tree: [] } };
    }
    throw new Error("readBlob must not be called");
  };
  const reader = createGitHubCommitReader({
    repository: "sitedauni/apidevelopers-platform",
    commit: COMMIT,
    request,
  });

  await assert.rejects(
    projectPortalInstitutionalState({
      reader,
      extractionOptions: { requireAllTypes: true },
    }),
    (error) => error.code === "PORTAL_GITHUB_PROVIDER_TREE_TRUNCATED",
  );
});
