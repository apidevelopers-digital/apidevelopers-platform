import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTRACT_SNAPSHOT_OBSERVED_AT,
  createHostingerNodeBuildExecutorPreflight,
  HOSTINGER_API_VERSION,
  HOSTINGER_ARCHIVE_FIELD_TYPE,
  HOSTINGER_ENDPOINT,
  HOSTINGER_OPENAPI_VERSION,
  HOSTINGER_REQUEST_MEDIA_TYPE,
  HOSTINGER_REQUEST_SCHEMA,
  SOURCE_ARTIFACT_NAME,
  SOURCE_RUN_ID,
  SOURCE_SHA,
  SOURCE_ZIP_NAME,
  TARGET_DOMAIN,
} from "../src/hostinger-node-build-executor-preflight.mjs";

const generatedAt = "2026-08-02T08:05:00.000Z";

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

test("pins the verified official OpenAPI snapshot without claiming executable transport", () => {
  const preflight = createHostingerNodeBuildExecutorPreflight({ generatedAt });
  const snapshot = preflight.officialContractSnapshot;

  assert.equal(snapshot.repository, "hostinger/api");
  assert.equal(snapshot.path, "openapi.json");
  assert.equal(snapshot.openapiVersion, HOSTINGER_OPENAPI_VERSION);
  assert.equal(snapshot.apiVersion, HOSTINGER_API_VERSION);
  assert.equal(snapshot.observedAt, CONTRACT_SNAPSHOT_OBSERVED_AT);
  assert.equal(snapshot.endpoint, HOSTINGER_ENDPOINT);
  assert.equal(snapshot.operationId, "hosting_createNodeJSBuildFromArchiveV1");
  assert.equal(snapshot.requestMediaType, HOSTINGER_REQUEST_MEDIA_TYPE);
  assert.equal(snapshot.requestSchema, HOSTINGER_REQUEST_SCHEMA);
  assert.equal(snapshot.archiveField.required, true);
  assert.equal(snapshot.archiveField.type, HOSTINGER_ARCHIVE_FIELD_TYPE);
  assert.equal(snapshot.archiveField.format, null);
  assert.equal(snapshot.archiveField.maximumBytes, 50 * 1024 * 1024);
  assert.equal(snapshot.documentationSnapshotVerified, true);
  assert.equal(snapshot.executableTransportVerified, false);
});

test("records the server conflict and keeps every external action disabled", () => {
  const preflight = createHostingerNodeBuildExecutorPreflight({ generatedAt });

  assert.equal(preflight.serverContractConflict.issueNumber, 56);
  assert.equal(preflight.serverContractConflict.issueStateAtSnapshot, "open");
  assert.equal(
    preflight.serverContractConflict.documentedJsonCtringResult,
    "reported_422_archive_must_be_file",
  );
  assert.equal(
    preflight.serverContractConflict.multipartFileResult,
    "reported_403_cloudflare_managed_challenge_before_api",
  );
  assert.equal(
    preflight.serverContractConflict.independentSuccessfulRequestVerified,
    false,
  );
  assert.equal(preflight.barriers.requestPrepared, false);
  assert.equal(preflight.barriers.lockClaimEnabled, false);
  assert.equal(preflight.barriers.hostingerPostEnabled, false);
  assert.equal(preflight.barriers.buildPollingEnabled, false);
  assert.equal(preflight.barriers.deployEnabled, false);
  assert.equal(preflight.barriers.dnsEnabled, false);
  assert.deepEqual(preflight.barriers.secretsRequired, []);
  assert.equal(preflight.barriers.hostingerTokenUsed, false);
});

test("cannot be unlocked by a manual flag or runtime override", () => {
  const preflight = createHostingerNodeBuildExecutorPreflight({ generatedAt });

  assert.equal(preflight.releaseGuard.officialContractChangeRequired, true);
  assert.equal(
    preflight.releaseGuard.issueResolutionOrIndependentVerificationRequired,
    true,
  );
  assert.equal(preflight.releaseGuard.manualFlagUnlockAllowed, false);
  assert.equal(preflight.releaseGuard.runtimeOverrideAllowed, false);
  assert.equal(preflight.releaseGuard.requestBuilderPresent, false);
  assert.equal(preflight.releaseGuard.executorPresent, false);
  assert.match(
    preflight.blockReason,
    /official_contract_server_validation_conflict/,
  );
  assert.ok(
    preflight.unblockRequirements.includes("new_executor_pull_request"),
  );
  assert.ok(
    preflight.unblockRequirements.includes(
      "fresh_single_use_approval_bound_to_exact_sha_archive_and_contract_snapshot",
    ),
  );
});

test("rejects an empty generation timestamp", () => {
  assert.throws(
    () => createHostingerNodeBuildExecutorPreflight({ generatedAt: "" }),
    /missing_or_invalid:generatedAt/,
  );
});
