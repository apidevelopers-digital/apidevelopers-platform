import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  validateExistingExecutionLock,
} from "../src/hostinger-website-create-lock-validation.mjs";

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function fixture() {
  const authorization = {
    draftInfo: {
      fingerprint:
        "33d5b094f12cbb9a1b5513853d69755ba4f05dced90d8f13fc950ca869c5a1c6",
      domain: "preview-apidevelopers.apidevelopers.digital",
      orderId: "1009450581",
      datacenterCode: "ascenty",
    },
    approvalInfo: {
      fingerprint:
        "7fbaad1e65356f8cfcd86bca1c6121e2ba74021f5f45184d07cf87bdf09427b1",
    },
  };
  const body = {
    schemaVersion: "1.0",
    kind: "hostinger-business-hosting-website-create-execution-lock",
    status: "claimed",
    singleUse: true,
    executable: false,
    claimedAt: "2026-07-31T05:34:07.000Z",
    source: {
      repository: "apidevelopers-digital/apidevelopers-platform",
      sourceSha: "fcb6f419ec0ded006e68a0c6e0bf59ba822b949f",
      workflowRunId: "30607159389",
      draftFingerprint: authorization.draftInfo.fingerprint,
      approvalFingerprint: authorization.approvalInfo.fingerprint,
    },
    target: {
      domain: authorization.draftInfo.domain,
      datacenterCode: authorization.draftInfo.datacenterCode,
      orderReference: "order-****0581",
    },
    hostinger: {
      postEndpoint: "/api/hosting/v1/websites",
      postExecuted: false,
    },
    constraints: {
      connectRepository: false,
      configureDns: false,
      uploadArchive: false,
      startNodeBuild: false,
      deployArtifact: false,
      productionWrites: false,
      wordpressChanges: false,
    },
  };

  return {
    authorization,
    lock: { ...body, fingerprint: digest(body) },
  };
}

test("validates a matching immutable execution lock", () => {
  const { authorization, lock } = fixture();
  const result = validateExistingExecutionLock({
    lock,
    authorization,
    repository: "apidevelopers-digital/apidevelopers-platform",
  });

  assert.equal(result.fingerprint, lock.fingerprint);
  assert.equal(result.workflowRunId, "30607159389");
});

test("rejects a tampered execution lock", () => {
  const { authorization, lock } = fixture();
  lock.target.datacenterCode = "other";

  assert.throws(
    () =>
      validateExistingExecutionLock({
        lock,
        authorization,
        repository: "apidevelopers-digital/apidevelopers-platform",
      }),
    /execution_lock_fingerprint_mismatch/,
  );
});
