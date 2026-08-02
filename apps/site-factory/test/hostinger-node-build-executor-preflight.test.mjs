import test from "node:test";
import assert from "node:assert/strict";

import {
  createHostingerNodeBuildExecutorPreflight,
  HOSTINGER_API_VERSION,
  HOSTINGER_ENDPOINT,
  HOSTINGER_OPENAPI_VERSION,
  HOSTINGER_REQUEST_MEDIA_TYPE,
  HOSTINGER_REQUEST_SCHEMA,
  SOURCE_RUN_ID,
  SOURCE_SHA,
  TARGET_DOMAIN,
} from "../src/hostinger-node-build-executor-preflight.mjs";

const generatedAt = "2026-08-02T08:05:00.000Z";

function createPreflight() {
  return createHostingerNodeBuildExecutorPreflight({ generatedAt });
}

test("creates a deterministic blocked single-use preflight", () => {
  const first = createPreflight();
  const second = createPreflight();

  assert.equal(first.status, "blocked");
  assert.equal(first.mode, "dry-run");
  assert.equal(first.readyForApply, false);
  assert.equal(first.approvalRequired, true);
  assert.equal(first.singleUse, true);
  assert.equal(first.source.sha, SOURCE_SHA);
  assert.equal(first.source.workflowRunId, SOURCE_RUN_ID);
  assert.equal(first.target.domain, TARGET_DOMAIN);
  assert.equal(first.fingerprint, second.fingerprint);
});

test("pins the official OpenAPI snapshot without claiming executable transport", () => {
  const snapshot = createPreflight().officialContractSnapshot;

  assert.equal(snapshot.repository, "hostinger/api");
  assert.equal(snapshot.path, "openapi.json");
  assert.equal(snapshot.openapiVersion, HOSTINGER_OPENAPI_VERSION);
  assert.equal(snapshot.apiVersion, HOSTINGER_API_VERSION);
  assert.equal(snapshot.endpoint, HOSTINGER_ENDPOINT);
  assert.equal(snapshot.operationId, "hosting_createNodeJSBuildFromArchiveV1");
  assert.equal(snapshot.requestMediaType, HOSTINGER_REQUEST_MEDIA_TYPE);
  assert.equal(snapshot.requestSchema, HOSTINGER_REQUEST_SCHEMA);
  assert.deepEqual(snapshot.archiveField, {
    required: true,
    type: "string",
    format: null,
    maximumBytes: 50 * 1024 * 1024,
  });
  assert.equal(snapshot.documentationSnapshotVerified, true);
  assert.equal(snapshot.executableTransportVerified, false);
});

test("records the server conflict and disables every external action", () => {
  const preflight = createPreflight();
  const conflict = preflight.serverContractConflict;
  const barriers = preflight.barriers;

  assert.equal(conflict.issueNumber, 56);
  assert.equal(conflict.issueStateAtSnapshot, "open");
  assert.equal(
    conflict.documentedJsonStringResult,
    "reported_422_archive_must_be_file",
  );
  assert.equal(
    conflict.documentedJsonBase64Result,
    "reported_422_archive_must_be_file_and_51200_character_limit",
  );
  assert.equal(
    conflict.multipartFileResult,
    "reported_403_cloudflare_managed_challenge_before_api",
  );
  assert.equal(conflict.independentSuccessfulRequestVerified, false);

  assert.deepEqual(barriers, {
    requestPrepared: false,
    lockClaimEnabled: false,
    hostingerPostEnabled: false,
    buildPollingEnabled: false,
    deployEnabled: false,
    dnsEnabled: false,
    secretsRequired: [],
    hostingerTokenUsed: false,
  });
});

test("cannot be unlocked by a manual flag or runtime override", () => {
  const preflight = createPreflight();
  const guard = preflight.releaseGuard;

  assert.equal(guard.officialContractChangeRequired, true);
  assert.equal(guard.issueResolutionOrIndependentVerificationRequired, true);
  assert.equal(guard.manualFlagUnlockAllowed, false);
  assert.equal(guard.runtimeOverrideAllowed, false);
  assert.equal(guard.requestBuilderPresent, false);
  assert.equal(guard.executorPresent, false);
  assert.equal(
    preflight.blockReason,
    "official_contract_server_validation_conflict",
  );
  assert.ok(
    preflight.unblockRequirements.includes(
      "upstream_issue_resolved_or_independent_success_evidence_recorded",
    ),
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
