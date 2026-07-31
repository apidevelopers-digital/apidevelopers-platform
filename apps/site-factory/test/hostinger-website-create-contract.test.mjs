import crypto from "node:crypto";

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExecutionEvidence,
  validateCreateAuthorization,
} from "../src/hostinger-website-create-contract.mjs";
import {
  domain,
  makeApproval,
  makeDraft,
  now,
  repository,
  sourceSha,
} from "./hostinger-website-create-fixture.mjs";

test("validates exact draft and approval", () => {
  const draft = makeDraft();
  const result = validateCreateAuthorization({
    draft,
    approval: makeApproval(draft),
    expectedFingerprint: draft.fingerprint,
    expectedRepository: repository,
    now,
  });

  assert.equal(result.draftInfo.domain, domain);
  assert.equal(result.draftInfo.datacenterCode, "ascenty");
  assert.equal(result.approvalInfo.approvedAt, "2026-07-31T03:41:00.000Z");
});

test("rejects tampered draft", () => {
  const draft = makeDraft();
  draft.request.payload.datacenter_code = "other";

  assert.throws(
    () =>
      validateCreateAuthorization({
        draft,
        approval: makeApproval(draft),
        expectedFingerprint: draft.fingerprint,
        expectedRepository: repository,
        now,
      }),
    /draft_fingerprint_mismatch/,
  );
});

test("rejects expired approval", () => {
  const draft = makeDraft();
  const approval = makeApproval(draft);
  const body = { ...approval, expiresAt: "2026-07-31T03:45:00.000Z" };
  delete body.fingerprint;
  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");

  assert.throws(
    () =>
      validateCreateAuthorization({
        draft,
        approval: { ...body, fingerprint },
        expectedFingerprint: draft.fingerprint,
        expectedRepository: repository,
        now,
      }),
    /approval_expired/,
  );
});

test("builds sanitized execution evidence", () => {
  const draft = makeDraft();
  const authorization = validateCreateAuthorization({
    draft,
    approval: makeApproval(draft),
    expectedFingerprint: draft.fingerprint,
    expectedRepository: repository,
    now,
  });

  const evidence = buildExecutionEvidence({
    result: {
      outcome: "created",
      hostingerPostExecuted: true,
      hostingerPostStatus: 201,
      website: {
        domain,
        username: "preview-user",
        orderId: "1009450581",
        isEnabled: true,
      },
      ...authorization,
    },
    repository,
    executionSha: sourceSha,
    workflowRunId: "123",
    executedAt: "2026-07-31T03:55:00.000Z",
  });

  assert.equal(evidence.hostinger.orderReference, "order-****0581");
  assert.equal(evidence.constraints.dnsChanged, false);
  assert.equal(evidence.constraints.deployExecuted, false);
  assert.match(evidence.fingerprint, /^[a-f0-9]{64}$/);
});
