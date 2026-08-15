import assert from "node:assert/strict";
import { constants, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createGlobalTrustEvaluationRecipientKeyEnrollmentService } from "../src/global-trust-evaluation-recipient-key-enrollment.mjs";
import { createTrustEvaluationRecipientKeyProofService } from "../src/global-trust-evaluation-recipient-key-proof.mjs";

const ORG = "component.organization.acme";
const NOW = "2026-08-14T12:00:00.000Z";

function keys(bits = 2048) {
  return generateKeyPairSync("rsa", {
    modulusLength: bits,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}
function admin() {
  return Object.freeze({
    role: "admin",
    principal: Object.freeze({
      id: "platform-admin",
      name: "Platform Administrator",
      status: "active",
      scopes: Object.freeze(["admin:*"]),
    }),
  });
}
function client() {
  return Object.freeze({
    role: "client",
    principal: Object.freeze({
      id: "client-1",
      status: "active",
      scopes: Object.freeze(["trust:evaluate"]),
    }),
  });
}
function approval(overrides = {}) {
  return {
    decision: "approved",
    assertion: "organization_and_recipient_authorized",
    reference: "institutional-decision:trust-evaluation:acme:001",
    authority: "API Developers.digital",
    approvedBy: "institutional-approver-1",
    approvedAt: "2026-08-14T11:59:00.000Z",
    subjectOrganizationId: ORG,
    ...overrides,
  };
}
function signature(challenge, privateKey) {
  return sign(
    "sha256",
    Buffer.from(challenge.signingPayloadB64u, "base64url"),
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    },
  ).toString("base64url");
}
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trust-key-enrollment-"));
  const filePath = path.join(dir, "state.json");
  let now = NOW;
  let seq = 0;
  const store = createJsonFileStore({
    filePath,
    clock: () => now,
    idFactory: () => `write-${++seq}`,
  });
  return {
    dir,
    filePath,
    store,
    proofService: createTrustEvaluationRecipientKeyProofService({ store, clock: () => now }),
    enrollmentService: createGlobalTrustEvaluationRecipientKeyEnrollmentService({ store, clock: () => now }),
    setNow(value) { now = value; },
  };
}
async function prove(fx, pair, correlationId = "corr-key-proof-001") {
  const challenge = await fx.proofService.issueChallenge({
    organizationId: ORG,
    recipientPublicKey: pair.publicKey,
    correlationId,
  });
  const proof = await fx.proofService.verifyAndConsume({
    challengeId: challenge.challengeId,
    recipientPublicKey: pair.publicKey,
    signatureB64u: signature(challenge, pair.privateKey),
  });
  assert.equal(proof.keyPossessionVerified, true);
  assert.equal(proof.identityVerified, false);
  return challenge;
}
function enrollmentRequest(pair, challenge, extraApproval = {}) {
  return {
    identity: admin(),
    organizationId: ORG,
    recipientPublicKey: pair.publicKey,
    keyProofChallengeId: challenge.challengeId,
    institutionalApproval: approval(extraApproval),
  };
}

test("approved enrollment requires consumed PoP plus external institutional decision and persists only public material", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));
  const pair = keys();
  const challenge = await prove(fx, pair);
  const receipt = await fx.enrollmentService.recordApprovedEnrollment(enrollmentRequest(pair, challenge));

  assert.equal(receipt.created, true);
  assert.equal(receipt.status, "approved");
  assert.equal(receipt.organizationId, ORG);
  assert.equal(receipt.keyPossessionVerified, true);
  assert.equal(receipt.institutionalApprovalRecorded, true);
  assert.equal(receipt.identityVerifiedByThisService, false);
  assert.equal(receipt.approvalReference, approval().reference);
  assert.equal(receipt.approvedBy, approval().approvedBy);
  assert.equal(receipt.recordedBy.id, "platform-admin");

  const enrolled = await fx.enrollmentService.getApprovedEnrollment({
    identity: admin(),
    organizationId: ORG,
  });
  assert.equal(enrolled.status, "approved");
  assert.equal(enrolled.recipientKeyFingerprint, receipt.recipientKeyFingerprint);
  assert.equal(enrolled.recipientPublicKeySpkiPem, pair.publicKey);
  assert.equal(enrolled.keyPossessionVerified, true);
  assert.equal(enrolled.identityVerifiedByThisService, false);

  const snapshot = await readFile(fx.filePath, "utf8");
  assert.equal(snapshot.includes(pair.privateKey), false);
  assert.equal(snapshot.includes("signatureB64u"), false);
  assert.equal(snapshot.includes("PRIVATE KEY"), false);
  assert.match(snapshot, /organization_and_recipient_authorized/);
  assert.match(snapshot, /external_institutional_decision/);
});

test("exact enrollment retry is idempotent and does not rewrite the approved recipient key", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));
  const pair = keys();
  const challenge = await prove(fx, pair);
  const request = enrollmentRequest(pair, challenge);

  const first = await fx.enrollmentService.recordApprovedEnrollment(request);
  fx.setNow("2026-08-14T12:01:00.000Z");
  const second = await fx.enrollmentService.recordApprovedEnrollment(request);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.enrollmentId, first.enrollmentId);
  assert.equal(second.recipientKeyFingerprint, first.recipientKeyFingerprint);
  assert.equal(second.recordedAt, first.recordedAt);
});

test("different key for the same organization requires rotation or revocation", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));
  const firstPair = keys();
  const firstChallenge = await prove(fx, firstPair, "corr-key-proof-first");
  await fx.enrollmentService.recordApprovedEnrollment(enrollmentRequest(firstPair, firstChallenge));

  fx.setNow("2026-08-14T12:02:00.000Z");
  const secondPair = keys();
  const secondChallenge = await prove(fx, secondPair, "corr-key-proof-second");
  await assert.rejects(
    fx.enrollmentService.recordApprovedEnrollment(
      enrollmentRequest(secondPair, secondChallenge, {
        reference: "institutional-decision:trust-evaluation:acme:002",
        approvedAt: "2026-08-14T12:01:30.000Z",
      }),
    ),
    (error) => error.code === "TRUST_EVALUATION_KEY_ENROLLMENT_CONFLICT",
  );
});

test("unconsumed PoP cannot be converted into an approved enrollment", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));
  const pair = keys();
  const challenge = await fx.proofService.issueChallenge({
    organizationId: ORG,
    recipientPublicKey: pair.publicKey,
    correlationId: "corr-unconsumed",
  });
  await assert.rejects(
    fx.enrollmentService.recordApprovedEnrollment(enrollmentRequest(pair, challenge)),
    (error) => error.code === "TRUST_EVALUATION_KEY_ENROLLMENT_PROOF_NOT_CONSUMED",
  );
});

test("non-admin is rejected before enrollment and approved enrollment read is operator-only", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));
  const pair = keys();

  await assert.rejects(
    fx.enrollmentService.recordApprovedEnrollment({
      identity: client(),
      organizationId: ORG,
      recipientPublicKey: pair.publicKey,
      keyProofChallengeId: "not-relevant",
      institutionalApproval: approval(),
    }),
    (error) => error.code === "TRUST_EVALUATION_KEY_ENROLLMENT_FORBIDDEN",
  );
  await assert.rejects(
    fx.enrollmentService.getApprovedEnrollment({
      identity: client(),
      organizationId: ORG,
    }),
    (error) => error.code === "TRUST_EVALUATION_KEY_ENROLLMENT_FORBIDDEN",
  );
});

test("approval subject, assertion and time are validated without pretending to perform identity verification", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));
  const pair = keys();
  const challenge = await prove(fx, pair);

  await assert.rejects(
    fx.enrollmentService.recordApprovedEnrollment(
      enrollmentRequest(pair, challenge, {
        subjectOrganizationId: "component.organization.other",
      }),
    ),
    (error) => error.code === "TRUST_EVALUATION_KEY_ENROLLMENT_APPROVAL_SUBJECT_MISMATCH",
  );

  await assert.rejects(
    fx.enrollmentService.recordApprovedEnrollment(
      enrollmentRequest(pair, challenge, {
        assertion: "self_attested_identity",
      }),
    ),
    (error) => error.code === "TRUST_EVALUATION_KEY_ENROLLMENT_INVALID_APPROVAL_ASSERTION",
  );

  await assert.rejects(
    fx.enrollmentService.recordApprovedEnrollment(
      enrollmentRequest(pair, challenge, {
        approvedAt: "2026-08-14T12:05:00.000Z",
      }),
    ),
    (error) => error.code === "TRUST_EVALUATION_KEY_ENROLLMENT_APPROVAL_IN_FUTURE",
  );
});
