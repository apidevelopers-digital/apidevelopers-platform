import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  TRUST_FACE_SIGNED_GOVERNED_TEMPLATE_VAULT_FLOW_V1 as PROFILE,
  createSignedGovernedTemplateVaultFlow,
} from "../src/signed-governed-template-vault-flow-v1.mjs";

const d = (c) => `sha256:${c.repeat(64)}`;

function repository(idField) {
  const records = new Map();
  return {
    async create(value) {
      const id = value[idField];
      if (records.has(id)) {
        const error = new Error("record conflict");
        error.code = "record_conflict";
        throw error;
      }
      records.set(id, structuredClone(value));
      return structuredClone(value);
    },
    async getById(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async list({ where = {} } = {}) {
      return [...records.values()]
        .filter((value) => Object.entries(where).every(([key, expected]) => value[key] === expected))
        .map((value) => structuredClone(value));
    },
  };
}

function createFlow() {
  return createSignedGovernedTemplateVaultFlow({
    enrollmentRepository: repository("enrollmentId"),
    revocationRepository: repository("enrollmentId"),
    receiptRepository: repository("vaultReceiptId"),
    trustedKeyRepository: repository("keyId"),
    trustedKeyRevocationRepository: repository("keyId"),
  });
}

const enrollmentInput = () => ({
  enrollmentId: "enrollment-001",
  subjectRef: "subject-ref-001",
  templateRef: "vault://trust-face/templates/template-001",
  templateDigest: d("1"),
  modelVersion: "trust-face-owned-embedding/v1",
  consentLedgerDigest: d("2"),
  authorizationDigest: d("3"),
  enrolledAt: "2026-09-01T12:00:00Z",
});

const envelopeMetadata = () => ({
  envelopeRef: "opaque-envelope-ref:trust-face/lab/envelope-001",
  keyRef: "opaque-key-ref:trust-face/lab/key-001",
  encryptionAlgorithm: "AES-256-GCM",
  createdAt: "2026-09-01T12:01:00Z",
});

async function prepareSignedAccess(flow) {
  const manifest = await flow.enroll(enrollmentInput());
  const receipt = await flow.recordVaultReceipt({
    enrollmentId: manifest.enrollmentId,
    vaultReceiptId: "vault-receipt-001",
    envelopeMetadata: envelopeMetadata(),
    auditDigest: d("4"),
    recordedAt: "2026-09-01T12:02:00Z",
  });
  const authorization = await flow.createLabAccessAuthorization({
    vaultReceiptId: receipt.vaultReceiptId,
    authorizationId: "vault-access-auth-001",
    purposeCode: "verification-orchestration",
    issuedAt: "2026-09-01T12:03:00Z",
    expiresAt: "2026-09-01T12:20:00Z",
  });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  await flow.registerLabTrustedPublicKey({
    keyId: "lab-key-001",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    validFrom: "2026-09-01T12:00:00Z",
    validUntil: "2026-09-01T13:00:00Z",
    registeredAt: "2026-09-01T12:01:30Z",
    registrationEvidenceDigest: d("5"),
  });
  const proof = {
    keyId: "lab-key-001",
    algorithm: "Ed25519",
    signedMessage: "authorizationDigest",
    authorizationDigest: authorization.authorizationDigest,
    signature: sign(null, Buffer.from(authorization.authorizationDigest), privateKey).toString("base64"),
  };
  return { manifest, receipt, authorization, proof };
}

test("profile remains simulation-only and non-production", () => {
  assert.equal(PROFILE.signedAccessLifecycleComposed, true);
  assert.equal(PROFILE.labTrustRegistryIntegrated, true);
  assert.equal(PROFILE.cryptographicAuthorizationProofVerifiedInLab, true);
  for (const field of [
    "signingPerformed",
    "privateKeyAccepted",
    "privateKeyStored",
    "externalAuthorizationIssuerIntegrated",
    "externalRevocationAuthorityIntegrated",
    "productionTrustRegistryIntegrated",
    "productionKeyManagementIntegrated",
    "productionCryptographicAuthorizationProofVerified",
    "realVaultAccessAuthorized",
    "realVaultRevocationEnforced",
    "realEnrollmentReady",
    "realVaultReady",
    "livenessPad",
    "productionReady",
    "biometricClaimReady",
  ]) assert.equal(PROFILE[field], false);
});

test("signed governed path composes active enrollment receipt authorization trusted key and external proof", async () => {
  const flow = createFlow();
  const { receipt, authorization, proof } = await prepareSignedAccess(flow);
  const result = await flow.getCryptographicallyVerifiedAuthorizedReceipt({
    vaultReceiptId: receipt.vaultReceiptId,
    authorization,
    proof,
    purposeCode: "verification-orchestration",
    now: "2026-09-01T12:04:00Z",
  });
  assert.equal(result.authorized, true);
  assert.equal(result.vaultReceipt.vaultReceiptId, "vault-receipt-001");
  assert.equal(result.cryptographicProof.verified, true);
  assert.equal(result.trustedKey.keyId, "lab-key-001");
  assert.equal(result.productionReady, false);
});

test("trusted-key revocation blocks signed governed access", async () => {
  const flow = createFlow();
  const { receipt, authorization, proof } = await prepareSignedAccess(flow);
  await flow.revokeLabTrustedPublicKey({
    keyId: "lab-key-001",
    reasonCode: "key-compromise",
    revokedAt: "2026-09-01T12:05:00Z",
    revocationEvidenceDigest: d("6"),
  });
  await assert.rejects(
    () => flow.getCryptographicallyVerifiedAuthorizedReceipt({
      vaultReceiptId: receipt.vaultReceiptId,
      authorization,
      proof,
      purposeCode: "verification-orchestration",
      now: "2026-09-01T12:07:00Z",
    }),
    (error) => error?.code === "template_vault_access_trust_registry_key_revoked",
  );
});

test("enrollment revocation remains effective in signed governed access", async () => {
  const flow = createFlow();
  const { manifest, receipt, authorization, proof } = await prepareSignedAccess(flow);
  const revocationAuthorization = await flow.createLabRevocationAuthorization({
    enrollmentId: manifest.enrollmentId,
    authorizationId: "revocation-auth-001",
    consentLedgerDigest: manifest.consentLedgerDigest,
    reasonCode: "subject-request",
    issuedAt: "2026-09-01T12:05:00Z",
    expiresAt: "2026-09-01T12:15:00Z",
  });
  await flow.revokeEnrollment({
    enrollmentId: manifest.enrollmentId,
    authorization: revocationAuthorization,
    reasonCode: "subject-request",
    revokedAt: "2026-09-01T12:06:00Z",
  });
  await assert.rejects(
    () => flow.getCryptographicallyVerifiedAuthorizedReceipt({
      vaultReceiptId: receipt.vaultReceiptId,
      authorization,
      proof,
      purposeCode: "verification-orchestration",
      now: "2026-09-01T12:07:00Z",
    }),
    (error) => error?.code === "template_vault_receipt_access_revoked",
  );
});

test("trusted-key lifecycle snapshot remains lab metadata", async () => {
  const flow = createFlow();
  const { publicKey } = generateKeyPairSync("ed25519");
  await flow.registerLabTrustedPublicKey({
    keyId: "lab-key-001",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    validFrom: "2026-09-01T12:00:00Z",
    validUntil: "2026-09-01T13:00:00Z",
    registeredAt: "2026-09-01T12:01:00Z",
    registrationEvidenceDigest: d("5"),
  });
  const snapshot = await flow.getTrustedKeyLifecycleSnapshot("lab-key-001", {
    now: "2026-09-01T12:10:00Z",
  });
  assert.equal(snapshot.state, "active");
  assert.equal(snapshot.privateKeyStored, false);
  assert.equal(snapshot.productionReady, false);
});

test("facade exposes no signing private-key deletion decryption or real-vault path", () => {
  const flow = createFlow();
  for (const field of [
    "signAuthorization",
    "createSignedProof",
    "storePrivateKey",
    "setPrivateKey",
    "getPrivateKey",
    "delete",
    "hardDelete",
    "deleteTrustedPublicKey",
    "decrypt",
    "getCiphertext",
    "getKeyMaterial",
    "getKmsMaterial",
  ]) assert.equal(flow[field], undefined);
  assert.equal(flow.signingPerformed, false);
  assert.equal(flow.privateKeyAccepted, false);
  assert.equal(flow.realVaultAccessAuthorized, false);
  assert.equal(flow.productionReady, false);
});
