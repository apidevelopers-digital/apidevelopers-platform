import assert from "node:assert/strict";
import { constants, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createCanonicalId } from "@apidevelopers/contracts";

import { openTrustEvaluationCredentialEnvelope } from "../src/global-trust-evaluation-credential-envelope.mjs";
import { createOperationalTrustEvaluationGateway } from "../src/operational-trust-evaluation-composition.mjs";

const NOW = "2026-08-14T13:00:00.000Z";
const SECRET = "trust_eval_approved_onboarding_0123456789abcdefghijklmnopqrstuvwxyz";
const ORGANIZATION_ID = createCanonicalId({
  family: "component",
  segments: ["organization", "approved-onboarding"],
});

function rsaPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
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

function approval() {
  return Object.freeze({
    decision: "approved",
    assertion: "organization_and_recipient_authorized",
    reference: "institutional-decision:trust-evaluation:approved-onboarding:001",
    authority: "API Developers.digital",
    approvedBy: "institutional-approver-1",
    approvedAt: "2026-08-14T12:59:00.000Z",
    subjectOrganizationId: ORGANIZATION_ID,
  });
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

async function fixture({ withDelivery = true } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trust-approved-onboarding-"));
  const stateFilePath = path.join(dir, "state.json");
  let writeCounter = 0;
  const envelopes = [];

  const gateway = createOperationalTrustEvaluationGateway({
    stateFilePath,
    clock: () => NOW,
    writeIdFactory: () => `write-${++writeCounter}`,
    apiKeyIdFactory: () => "apikey-approved-onboarding",
    generateKey: () => SECRET,
    assertTenantOperational: async () => true,
    ...(withDelivery
      ? {
          async deliverEvaluationEnvelope(envelope) {
            envelopes.push(structuredClone(envelope));
          },
        }
      : {}),
  });

  return { dir, stateFilePath, gateway, envelopes };
}

async function enrollApprovedRecipient(gateway, pair) {
  const challenge = await gateway.evaluationRecipientKeyProof.issueChallenge({
    organizationId: ORGANIZATION_ID,
    recipientPublicKey: pair.publicKey,
    correlationId: "corr-approved-onboarding-proof",
  });
  const proof = await gateway.evaluationRecipientKeyProof.verifyAndConsume({
    challengeId: challenge.challengeId,
    recipientPublicKey: pair.publicKey,
    signatureB64u: signatureFor(challenge, pair.privateKey),
  });
  assert.equal(proof.keyPossessionVerified, true);
  assert.equal(proof.identityVerified, false);

  return gateway.evaluationRecipientKeyEnrollment.recordApprovedEnrollment({
    identity: adminIdentity(),
    organizationId: ORGANIZATION_ID,
    recipientPublicKey: pair.publicKey,
    keyProofChallengeId: challenge.challengeId,
    institutionalApproval: approval(),
  });
}

test("approved onboarding uses only the enrolled public key and produces one sealed first-issue credential", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  assert.equal(typeof fx.gateway.evaluationRecipientKeyProof?.issueChallenge, "function");
  assert.equal(typeof fx.gateway.evaluationRecipientKeyEnrollment?.recordApprovedEnrollment, "function");
  assert.equal(typeof fx.gateway.evaluationApprovedOnboarding?.provisionApprovedEvaluation, "function");

  const pair = rsaPair();
  const enrollment = await enrollApprovedRecipient(fx.gateway, pair);
  assert.equal(enrollment.created, true);
  assert.equal(enrollment.identityVerifiedByThisService, false);

  const first = await fx.gateway.evaluationApprovedOnboarding.provisionApprovedEvaluation({
    identity: adminIdentity(),
    organizationId: ORGANIZATION_ID,
    slug: "approved-onboarding",
    displayName: "Approved Onboarding Evaluation",
    correlationId: "corr-approved-onboarding-provision-001",
  });

  assert.equal(first.created, true);
  assert.equal(first.secretDelivered, true);
  assert.equal(first.enrollmentId, enrollment.enrollmentId);
  assert.equal(first.recipientKeyFingerprint, enrollment.recipientKeyFingerprint);
  assert.equal(first.institutionalApprovalReference, approval().reference);
  assert.equal(first.handoffMode, "sealed_envelope");
  assert.equal(first.controls.financialEgress, "blocked");
  assert.equal(first.controls.realMoney, false);
  assert.equal(first.controls.biometricMaterialAccepted, false);
  assert.equal("secret" in first, false);
  assert.equal("hash" in first, false);
  assert.equal(JSON.stringify(first).includes(SECRET), false);
  assert.equal(fx.envelopes.length, 1);
  assert.equal(JSON.stringify(fx.envelopes[0]).includes(SECRET), false);
  assert.equal(fx.envelopes[0].recipientKeyFingerprint, enrollment.recipientKeyFingerprint);

  const issuedSecret = openTrustEvaluationCredentialEnvelope({
    envelope: fx.envelopes[0],
    recipientPrivateKey: pair.privateKey,
  });
  assert.equal(issuedSecret, SECRET);

  const response = await fx.gateway.app.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation",
    headers: {
      "x-tenant-id": first.tenantId,
      "x-api-key": issuedSecret,
    },
  });
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.allowed, true);
  assert.equal(body.evaluation.tenantId, first.tenantId);
  assert.equal(body.evaluation.environment, "sandbox");
  assert.equal(body.evaluation.controls.financialEgress, "blocked");
  assert.equal(body.evaluation.controls.realMoney, false);

  const second = await fx.gateway.evaluationApprovedOnboarding.provisionApprovedEvaluation({
    identity: adminIdentity(),
    organizationId: ORGANIZATION_ID,
    slug: "approved-onboarding",
    displayName: "Approved Onboarding Evaluation",
    correlationId: "corr-approved-onboarding-provision-002",
  });
  assert.equal(second.created, false);
  assert.equal(second.secretDelivered, false);
  assert.equal(second.enrolmentId, first.enrollmentId);
  assert.equal(fx.envelopes.length, 1);

  const persisted = await readFile(fx.stateFilePath, "utf8");
  assert.equal(persisted.includes(pair.privateKey), false);
  assert.equal(persisted.includes(SECRET), false);
});

test("approved onboarding fails before tenant provisioning when no approved enrollment exists", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  await assert.rejects(
    fx.gateway.evaluationApprovedOnboarding.provisionApprovedEvaluation({
      identity: adminIdentity(),
      organizationId: ORGANIZATION_ID,
      slug: "blocked-no-enrollment",
      displayName: "Blocked Evaluation",
      correlationId: "corr-no-enrollment",
    }),
    (error) => error.code === "TRUST_EVALUATION_APPROVED_ONBOARDING_ENROLLMENT_REQUIRED",
  );

  assert.equal(fx.envelopes.length, 0);
  const state = await fx.gateway.store.read();
  assert.equal(JSON.stringify(state).includes("blocked-no-enrollment"), false);
  assert.equal(JSON.stringify(state).includes(SECRET), false);
});

test("normal Evaluation composition exposes proof and enrollment but no approved provisioning without an envelope sink", async (t) => {
  const fx = await fixture({ withDelivery: false });
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  assert.equal(typeof fx.gateway.evaluationRecipientKeyProof?.issueChallenge, "function");
  assert.equal(typeof fx.gateway.evaluationRecipientKeyEnrollment?.recordApprovedEnrollment, "function");
  assert.equal("evaluationApprovedOnboarding" in fx.gateway, false);
  assert.equal("evaluationOperatorProvisioning" in fx.gateway, false);
});
