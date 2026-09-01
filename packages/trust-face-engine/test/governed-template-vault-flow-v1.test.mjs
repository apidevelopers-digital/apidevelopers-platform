import assert from "node:assert/strict";
import test from "node:test";
import {
  TRUST_FACE_GOVERNED_TEMPLATE_VAULT_FLOW_V1 as PROFILE,
  TrustFaceGovernedTemplateVaultFlowV1Error,
  createGovernedTemplateVaultFlow,
} from "../src/governed-template-vault-flow-v1.mjs";

const d = (c) => `sha256:${c.repeat(64)}`;

function repository(idField, initial = []) {
  const records = new Map(initial.map((value) => [value[idField], structuredClone(value)]));
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
  return createGovernedTemplateVaultFlow({
    enrollmentRepository: repository("enrollmentId"),
    revocationRepository: repository("enrollmentId"),
    receiptRepository: repository("vaultReceiptId"),
  });
}

const enrollmentInput = (overrides = {}) => ({
  enrollmentId: "enrollment-001",
  subjectRef: "subject-ref-001",
  templateRef: "vault://trust-face/templates/template-001",
  templateDigest: d("1"),
  modelVersion: "trust-face-owned-embedding/v1",
  consentLedgerDigest: d("2"),
  authorizationDigest: d("3"),
  enrolledAt: "2026-09-01T12:00:00Z",
  ...overrides,
});

const envelopeMetadata = () => ({
  envelopeRef: "opaque-envelope-ref:trust-face/lab/envelope-001",
  keyRef: "opaque-key-ref:trust-face/lab/key-001",
  encryptionAlgorithm: "AES-256-GCM",
  createdAt: "2026-09-01T12:01:00Z",
});

test("profile remains simulation-only and non-production", () => {
  assert.equal(PROFILE.mode, "simulation-lab-only");
  assert.equal(PROFILE.endToEndLifecycleComposed, true);
  assert.equal(PROFILE.metadataOnly, true);
  for (const field of [
    "authorizationIssuerIntegrated",
    "cryptographicAuthorizationProofVerified",
    "biometricTemplateStored",
    "ciphertextStored",
    "encryptionPerformed",
    "decryptionPerformed",
    "keyMaterialAccepted",
    "kmsMaterialAccepted",
    "rawBiometricPayloadAccepted",
    "rawEmbeddingAccepted",
    "realVaultRevocationEnforced",
    "realVaultAccessAuthorized",
    "hardDeleteAllowed",
    "templateDeletionPerformed",
    "realEnrollmentReady",
    "realVaultReady",
    "livenessPad",
    "productionReady",
    "biometricClaimReady",
  ]) assert.equal(PROFILE[field], false);
});

test("composes enrollment receipt and explicit authorized metadata access", async () => {
  const flow = createFlow();
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
    expiresAt: "2026-09-01T12:10:00Z",
  });
  const result = await flow.getAuthorizedReceipt({
    vaultReceiptId: receipt.vaultReceiptId,
    authorization,
    purposeCode: "verification-orchestration",
    now: "2026-09-01T12:04:00Z",
  });
  assert.equal(result.authorized, true);
  assert.equal(result.vaultReceipt.vaultReceiptId, "vault-receipt-001");
  assert.equal(result.realVaultAccessAuthorized, false);
  assert.equal(result.productionReady, false);
});

test("governed revocation blocks receipt access even with previously valid authorization", async () => {
  const flow = createFlow();
  const manifest = await flow.enroll(enrollmentInput());
  const receipt = await flow.recordVaultReceipt({
    enrollmentId: manifest.enrollmentId,
    vaultReceiptId: "vault-receipt-001",
    envelopeMetadata: envelopeMetadata(),
    auditDigest: d("4"),
    recordedAt: "2026-09-01T12:02:00Z",
  });
  const accessAuthorization = await flow.createLabAccessAuthorization({
    vaultReceiptId: receipt.vaultReceiptId,
    authorizationId: "vault-access-auth-001",
    purposeCode: "verification-orchestration",
    issuedAt: "2026-09-01T12:03:00Z",
    expiresAt: "2026-09-01T12:20:00Z",
  });
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
    () => flow.getAuthorizedReceipt({
      vaultReceiptId: receipt.vaultReceiptId,
      authorization: accessAuthorization,
      purposeCode: "verification-orchestration",
      now: "2026-09-01T12:07:00Z",
    }),
    (error) => error?.code === "template_vault_receipt_access_revoked",
  );
});

test("lifecycle snapshot transitions from active to revoked without deleting receipt", async () => {
  const flow = createFlow();
  const manifest = await flow.enroll(enrollmentInput());
  const receipt = await flow.recordVaultReceipt({
    enrollmentId: manifest.enrollmentId,
    vaultReceiptId: "vault-receipt-001",
    envelopeMetadata: envelopeMetadata(),
    auditDigest: d("4"),
    recordedAt: "2026-09-01T12:02:00Z",
  });
  const before = await flow.getLifecycleSnapshot({
    enrollmentId: manifest.enrollmentId,
    vaultReceiptId: receipt.vaultReceiptId,
    now: "2026-09-01T12:03:00Z",
  });
  assert.equal(before.lifecycleState, "active");
  assert.equal(before.receiptAccessGranted, true);

  const authorization = await flow.createLabRevocationAuthorization({
    enrollmentId: manifest.enrollmentId,
    authorizationId: "revocation-auth-001",
    consentLedgerDigest: manifest.consentLedgerDigest,
    reasonCode: "subject-request",
    issuedAt: "2026-09-01T12:04:00Z",
    expiresAt: "2026-09-01T12:15:00Z",
  });
  await flow.revokeEnrollment({
    enrollmentId: manifest.enrollmentId,
    authorization,
    reasonCode: "subject-request",
    revokedAt: "2026-09-01T12:05:00Z",
  });

  const after = await flow.getLifecycleSnapshot({
    enrollmentId: manifest.enrollmentId,
    vaultReceiptId: receipt.vaultReceiptId,
    now: "2026-09-01T12:06:00Z",
  });
  assert.equal(after.lifecycleState, "revoked");
  assert.equal(after.receiptAccessGranted, false);
  assert.equal(after.realVaultReady, false);
  assert.equal(after.productionReady, false);
});

test("snapshot fails closed when receipt belongs to another enrollment", async () => {
  const flow = createFlow();
  const first = await flow.enroll(enrollmentInput());
  await flow.enroll(enrollmentInput({
    enrollmentId: "enrollment-002",
    subjectRef: "subject-ref-002",
    templateRef: "vault://trust-face/templates/template-002",
    templateDigest: d("5"),
  }));
  const receipt = await flow.recordVaultReceipt({
    enrollmentId: first.enrollmentId,
    vaultReceiptId: "vault-receipt-001",
    envelopeMetadata: envelopeMetadata(),
    auditDigest: d("4"),
    recordedAt: "2026-09-01T12:02:00Z",
  });
  await assert.rejects(
    () => flow.getLifecycleSnapshot({
      enrollmentId: "enrollment-002",
      vaultReceiptId: receipt.vaultReceiptId,
      now: "2026-09-01T12:03:00Z",
    }),
    (error) =>
      error instanceof TrustFaceGovernedTemplateVaultFlowV1Error &&
      error.code === "governed_template_vault_flow_enrollment_receipt_mismatch",
  );
});

test("missing receipt fails closed during lab authorization construction", async () => {
  const flow = createFlow();
  await assert.rejects(
    () => flow.createLabAccessAuthorization({
      vaultReceiptId: "vault-receipt-missing",
      authorizationId: "vault-access-auth-001",
      purposeCode: "verification-orchestration",
      issuedAt: "2026-09-01T12:03:00Z",
      expiresAt: "2026-09-01T12:10:00Z",
    }),
    (error) =>
      error instanceof TrustFaceGovernedTemplateVaultFlowV1Error &&
      error.code === "template_vault_receipt_not_found",
  );
});

test("raw biometric template ciphertext key and secret payloads fail closed at composed boundary", async () => {
  const flow = createFlow();
  for (const [field, value] of [
    ["image", "forbidden"],
    ["embedding", [0.1, 0.2]],
    ["template", "forbidden"],
    ["ciphertext", "forbidden"],
    ["keyMaterial", "forbidden"],
    ["kmsMaterial", "forbidden"],
    ["secret", "forbidden"],
  ]) {
    await assert.rejects(
      () => flow.enroll({ ...enrollmentInput(), [field]: value }),
      (error) =>
        error instanceof TrustFaceGovernedTemplateVaultFlowV1Error &&
        error.code === "raw_governed_template_vault_flow_payload_forbidden",
    );
  }
});

test("facade exposes no deletion decryption real-vault or broad-listing path", () => {
  const flow = createFlow();
  for (const field of [
    "delete",
    "hardDelete",
    "deleteTemplate",
    "decrypt",
    "decryptTemplate",
    "getCiphertext",
    "getKeyMaterial",
    "getKmsMaterial",
    "listAuthorizedReceipts",
    "listReceipts",
  ]) assert.equal(flow[field], undefined);
  assert.equal(flow.realVaultAccessAuthorized, false);
  assert.equal(flow.realVaultRevocationEnforced, false);
  assert.equal(flow.productionReady, false);
});
