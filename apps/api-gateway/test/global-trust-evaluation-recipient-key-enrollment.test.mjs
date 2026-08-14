import assert from "node:assert/strict";
import { constants, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";

import { createGlobalTrustEvaluationRecipientKeyEnrollmentService } from "../src/global-trust-evaluation-recipient-key-enrollment.mjs";
import { createTrustEvaluationRecipientKeyProofService } from "../src/global-trust-evaluation-recipient-key-proof.mjs";

const ORGANIZATION_ID = "component.organization.acme";
const NOW = "2026-08-14T12:00:00.000Z";

function rsaPair(bits = 2048) {
  return generateKeyPairSync("rsa", {
    modulusLength: bits,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function adminIdentity() {
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

function clientIdentity() {
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
    subjectOrganizationId: ORGANIZATION_ID,
    ...overrides,
  };
}

function signatureFor(challenge, privateKey) {
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
  let writeCounter = 0;

  const store = createJsonFileStore({
    filePath,
    clock: () => now,
    idFactory: () => `write-${++writeCounter}`,
  });

  const proofService = createTrustEvaluationRecipientKeyProofService({
    store,
    clock: () => now,
  });

  const enrollmentService =
    createGlobalTrustEvaluationRecipientKeyEnrollmentService({
      store,
      clock: () => now,
    });

  return {
    dir,
    filePath,
    store,
    proofService,
    enrollmentService,
    setNow(value) {
      now = value;
    },
  };
}

async function provePossession(fx, keys, correlationId = "corr-key-proof-001") {
  const challenge = await fx.proofService.issueChallenge({
    organizationId: ORGANIZATION_ID,
    recipientPublicKey: keys.publicKey,
    correlationId,
  });

  const proof = await fx.proofService.verifyAndConsume({
    challengeId: challenge.challengeId,
    recipientPublicKey: keys.publicKey,
    signatureB64u: signatureFor(challenge, keys.privateKey),
  });

  assert.equal(proof.keyPossessionVerified, true);
  assert.equal(proof.identityVerified, false);
  return challenge;
}

test("approved enrollment requires consumed PoP plus external institutional decision and persists only public material", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  const keys = rsaPair();
  const challenge = await provePossession(fx, keys);

  const receipt = await fx.enrollmentService.recordApprovedEnrollment({
    identity: adminIdentity(),
    organizationId: ORGANIZATION_ID,
    recipientPublicKey: keys.publicKey,
    keyProofChallengeId: challenge.challengeId,
    institutionalApproval: approval(),
  });

  assert.equal(receipt.created, true);
  assert.equal(receipt.status, "approved");
  assert.equal(receipt.organizationId, ORGANIZATION_ID);
  assert.equal(receipt.keyPossessionVerified, true);
  assert.equal(receipt.institutionalApprovalRecorded, true);
  assert.equal(receipt.identityVerifiedByThisService, false);
  assert.equal(receipt.approvalReference, approval().reference);
  assert.equal(receipt.approvedBy, approval().approvedBy);
  assert.equal(receipt.recordedBy.id, "platform-admin");

  const enrolled = await fx.enrollmentService.getApprovedEnrollment({
    identity: adminIdentity(),
    organizationId: ORGANIZATION_ID,
  });

  assert.equal(enrolled.status, "approved");
  assert.equal(enrolled.recipientKeyFingerprint, receipt.recipientKeyFingerprint);
  assert.equal(enrolled.recipientPublicKeySpkiPem, keys.publicKey);
  assert.equal(enrolled.keyPossessionVerified, true);
  assert.equal(enrolled.identityVerifiedByThisService, false);

  const snapshot = await readFile(fx.filePath, "utf8");
  assert.equal(snapshot.includes(keys.privateKey), false);
  assert.equal(snapshot.includes("signatureB64u"), false);
  assert.equal(snapshot.includes("PRIVATE KEY"), false);
  assert.match(snapshot, /organization_and_recipient_authorized/);
  assert.match(snapshot, /external_institutional_decision/);
});

test("exact enrollment retry is idempotent and does not rewrite the approved recipient key", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  const keys = rsaPair();
  const challenge = await provePossession(fx, keys);
  const request = {
    identity: adminIdentity(),
    organizationId: ORGANIZATION_ID,
    recipientPublicKey: keys.publicKey,
    keyProofChallengeId: challenge.challengeId,
    institutionalApproval: approval(),
  };

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

  const firstKeys = rsaPair();
  const firstChallenge = await provePossession(fx, firstKeys, "corr-key-proof-first");
  await fx.enrollmentService.recordApprovedEnrollment({
    identity: adminIdentity(),
    organizationId: ORGANIZATION_ID,
    recipientPublicKey: firstKeys.publicKey,
    keyProofChallengeId: firstChallenge.challengeId,
    institutionalApproval: approval(),
  });

  fx.setNow("2026-08-14T12:02:00.000Z");
  const secondKeys = rsaPair();
  const secondChallenge = await provePossession(fx, secondKeys, "corr-key-proof-second");

  await assert.rejects(
    fx.enrollmentService.recordApprovedEnrollment({
      identity: adminIdentity(),
      organizationId: ORGANIZATION_ID,
      recipientPublicKey: secondKeys.publicKey,
      keyProofChallengeId: secondChallenge.challengeId,
      institutionalApproval: approval({
        reference: "institutional-decision:trust-evaluation:acme:002",
        approvedAt: "2026-08-14T12:01:30.000Z",
      }),
    }),
    (error) => error.code === "TRUST_EVALUATION_KEY_ENROLLMENT_CONFLICT",
  );
});

test("unconsumed PoP cannot be converted into an approved enrollment", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  const keys = rsaPair();
  const challenge = await fx.proofService.issueChallenge({
    organizationId: ORGANIZATION_ID,
    recipientPublicKey: keys.publicKey,
    correlationId: "corr-unconsumed",
  });

  await assert.rejects(
    fx.enrollmentService.recordApprovedEnrollment({
      identity: adminIdentity(),
      organizationId: ORGANIZATION_ID,
      recipientPublicKey: keys.publicKey,
      keyProofChallengeId: challenge.challengeId,
      institutionalApproval: approval(),
    }),
    (error) => error.code === "TRUST_EVALUATION_KEY_ENROLLMENT_PROOF_NOT_CONSUMED",
  );
});

test("non-admin is rejected before enrollment and approved enrollment read is also operator-only", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  await assert.rejects(
    fx.enrollmentService.recordApprovedEnrollment({
      identity: clientIdentity(),
      organizationId: ORGANIZATION_ID,
      recipientPublicKey: rsaPair().publicKey,
      keyProofChallengeId: "not-relevant",
      institutionalApproval: approval(),
    }),
    (error) => error.code === "TRUST_EVALUATION_KEY_ENROLLMENT_FORBIDDEN",
  );

  await assert.rejects(
    fx.enrollmentService.getApprovedEnrollment({
      identity: clientIdentity(),
      organizationId: ORGANIZATION_ID,
    }),
    (error) => error.code === "TRUST_EVALUATION_KEY_ENROLLMENT_FORBIDDEN",
  );
});

test("approval subject, assertion and time are validated without pretending to perform identity verification", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  const keys = rsaPair();
  const challenge = await provePossession(fx, keys);

  await assert.rejects(
    fx.enrolmentService.recordApprovedEnrollment({
      identity: adminIdentity(),
      organizationId: ORGANIZATION_ID,
      recipientPublicKey: keys.publicKey,
      keyProofChallengeId: challenge.challengeId,
      institutionalApproval: approval({
        subjectOrganizationId: "component.organization.other",
      }),
    }),
    (error) =>
      error.code === "TRUST_EVALUATION_KEY_ENROLLMENT_APPROVAL_SUBJECT_MISMATCH",
  );

  await assert.rejects(
    fx.enrollmentService.recordApprovedEnrollment({
      identity: adminIdentity(),
      organizationId: ORGANIZATION_ID,
      recipientPublicKey: keys.publicKey,
      keyProofChallengeId: challenge.challengeId,
      institutionalApproval: approval({
        assertion: "self_attested_identity",
      }),
    }),
    (error) =>
      error.code === "TRUST_EVALUATION_KEY_ENROLLMENT_INVALID_APPROVAL_ASSERTION",
  );

  await assert.rejects(
    fx.enrollmentService.recordApprovedEnrollment({
      identity: adminIdentity(),
      organizationId: ORGANIZATION_ID,
      recipientPublicKey: keys.publicKey,
      keyProofChallengeId: challenge.challengeId,
      institutionalApproval: approval({
        approvedAt: "2026-08-14T12:05:00.000Z",
      }),
    }),
    (error) =>
      error.code === "TRUST_EVALUATION_KEY_ENROLLMENT_APPROVAL_IN_FUTURE",
  );
});
