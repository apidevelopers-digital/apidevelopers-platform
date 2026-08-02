import test from "node:test";
import assert from "node:assert/strict";

import {
  createHostingerNodeBuildExecutorPreflight,
  SOURCE_ARTIFACT_NAME,
  SOURCE_RUN_ID,
  SOURCE_SHA,
  SOURCE_ZIP_NAME,
  TARGET_DOMAIN,
} from "../src/hostinger-node-build-executor-preflight.mjs";

const generatedAt = "2026-08-02T07:50:00.000Z";

test("creates a deterministic blocked single-use preflight", () => {
  const first = createHostingerNodeBuildExecutorPreflight({ generatedAt });
  const second = createHostingerNodeBuildExecutorPreflight({ generatedAt });

  assert.equal(first.status, "blocked");
  assert.equal(first.mode, "dry-run");
  assert.equal(first.readyForApply, false);
  assert.equal(first.approvalRequired, true);
  assert.equal(first.singleUse, true);
  assert.equal(first.source.sha, SOURCE_SHA);
  assert.equal(first.source.workflowRunId, SOURCE_RUN_ID);
  assert.equal(first.source.artifactName, SOURCE_ARTIFACT_NAME);
  assert.equal(first.source.archiveName, SOURCE_ZIP_NAME);
  assert.equal(first.target.domain, TARGET_DOMAIN);
  assert.equal(first.fingerprint, second.fingerprint);
});

test("keeps every remote write and execution barrier disabled", () => {
  const preflight = createHostingerNodeBuildExecutorPreflight({ generatedAt });

  assert.equal(preflight.officialApi.transportContractVerified, false);
  assert.equal(preflight.officialApi.contentType, null);
  assert.equal(preflight.officialApi.archiveFieldEncoding, null);
  assert.equal(preflight.officialApi.upstreamBlocker.issueNumber, 56);
  assert.equal(preflight.barriers.requestPrepared, false);
  assert.equal(preflight.barriers.lockClaimEnabled, false);
  assert.equal(preflight.barriers.hostingerPostEnabled, false);
  assert.equal(preflight.barriers.buildPollingEnabled, false);
  assert.equal(preflight.barriers.deployEnabled, false);
  assert.equal(preflight.barriers.dnsEnabled, false);
  assert.deepEqual(preflight.barriers.secretsRequired, []);
  assert.equal(preflight.barriers.hostingerTokenUsed, false);
});

test("requires a new reviewed implementation before any real execution", () => {
  const preflight = createHostingerNodeBuildExecutorPreflight({ generatedAt });

  assert.match(
    preflight.blockReason,
    /official_archive_transport_contract_unverified/,
  );
  assert.ok(
    preflight.unblockRequirements.includes("new_executor_pull_request"),
  );
  assert.ok(
    preflight.unblockRequirements.includes("fresh_single_use_approval"),
  );
});

test("rejects an empty generation timestamp", () => {
  assert.throws(
    () => createHostingerNodeBuildExecutorPreflight({ generatedAt: "" }),
    /missing_or_invalid:generatedAt/,
  );
});
