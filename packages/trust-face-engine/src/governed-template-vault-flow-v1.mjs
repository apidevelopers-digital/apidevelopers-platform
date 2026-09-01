import { createEnrollmentPersistence } from "./enrollment-manifest-v1.mjs";
import {
  createEnrollmentRevocationAuthorization,
  createAuthorizedEnrollmentRevocationPersistence,
} from "./enrollment-revocation-authorization-v1.mjs";
import { createTemplateVaultReceiptPersistence } from "./template-vault-receipt-v1.mjs";
import { createTemplateVaultRevocationGate } from "./template-vault-revocation-gate-v1.mjs";
import {
  createTemplateVaultAccessAuthorization,
  createAuthorizedTemplateVaultReceiptAccess,
} from "./template-vault-access-authorization-v1.mjs";

export const TRUST_FACE_GOVERNED_TEMPLATE_VAULT_FLOW_V1 = Object.freeze({
  version: "trust-face-governed-template-vault-flow/v1",
  purpose: "compose-governed-enrollment-vault-lifecycle-in-simulation",
  mode: "simulation-lab-only",
  endToEndLifecycleComposed: true,
  metadataOnly: true,
  authorizationIssuerIntegrated: false,
  cryptographicAuthorizationProofVerified: false,
  biometricTemplateStored: false,
  ciphertextStored: false,
  encryptionPerformed: false,
  decryptionPerformed: false,
  keyMaterialAccepted: false,
  kmsMaterialAccepted: false,
  rawBiometricPayloadAccepted: false,
  rawEmbeddingAccepted: false,
  simulatedRevocationEnforced: true,
  realVaultRevocationEnforced: false,
  realVaultAccessAuthorized: false,
  hardDeleteAllowed: false,
  templateDeletionPerformed: false,
  realEnrollmentReady: false,
  realVaultReady: false,
  livenessPad: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceGovernedTemplateVaultFlowV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceGovernedTemplateVaultFlowV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceGovernedTemplateVaultFlowV1Error(code, message);
};

const required = (value, field) => {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_governed_template_vault_flow_field", `${field} is required`);
  }
  return value.trim();
};

const RAW_FIELDS = new Set([
  "image", "imageData", "rawImage", "pixels", "video", "videoData", "frames",
  "bytes", "buffer", "embedding", "embeddings", "vector", "vectors",
  "template", "biometricTemplate", "templatePayload", "ciphertext",
  "encryptedPayload", "encryptedTemplate", "payload", "key", "keyMaterial",
  "kmsMaterial", "secret", "secretMaterial", "privateKey", "plaintext",
]);

function assertNoRawPayload(value, path = "input", seen = new Set()) {
  if (value === null || value === undefined || typeof value !== "object") return;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    fail("raw_governed_template_vault_flow_payload_forbidden", `${path} binary payload is forbidden`);
  }
  if (seen.has(value)) {
    fail("invalid_governed_template_vault_flow_object", `${path} must not contain circular references`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoRawPayload(entry, `${path}[${index}]`, seen));
  } else {
    for (const [key, entry] of Object.entries(value)) {
      if (RAW_FIELDS.has(key)) {
        fail("raw_governed_template_vault_flow_payload_forbidden", `${path}.${key} is forbidden`);
      }
      assertNoRawPayload(entry, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function assertRepository(repository, name, methods) {
  if (!repository || typeof repository !== "object") {
    fail(`invalid_${name}_repository`, `${name}Repository is required`);
  }
  for (const method of methods) {
    if (typeof repository[method] !== "function") {
      fail(`invalid_${name}_repository`, `${name}Repository must provide ${methods.join(", ")}`);
    }
  }
}

export function createGovernedTemplateVaultFlow({
  enrollmentRepository,
  revocationRepository,
  receiptRepository,
} = {}) {
  assertRepository(enrollmentRepository, "enrollment", ["create", "getById", "list"]);
  assertRepository(revocationRepository, "revocation", ["create", "getById", "list"]);
  assertRepository(receiptRepository, "receipt", ["create", "getById", "list"]);

  const enrollmentPersistence = createEnrollmentPersistence({ repository: enrollmentRepository });
  const revocationPersistence = createAuthorizedEnrollmentRevocationPersistence({
    enrollmentRepository,
    revocationRepository,
  });
  const vaultReceiptPersistence = createTemplateVaultReceiptPersistence({
    enrollmentRepository,
    receiptRepository,
  });
  const revocationGate = createTemplateVaultRevocationGate({
    vaultReceiptPersistence,
    enrollmentLifecyclePersistence: revocationPersistence,
  });
  const authorizedReceiptAccess = createAuthorizedTemplateVaultReceiptAccess({ revocationGate });

  return Object.freeze({
    ...TRUST_FACE_GOVERNED_TEMPLATE_VAULT_FLOW_V1,

    async enroll(input = {}) {
      assertNoRawPayload(input);
      return enrollmentPersistence.enroll(input);
    },

    async recordVaultReceipt({
      enrollmentId,
      vaultReceiptId,
      envelopeMetadata,
      auditDigest,
      recordedAt,
    } = {}) {
      assertNoRawPayload({ enrollmentId, vaultReceiptId, envelopeMetadata, auditDigest, recordedAt });
      return vaultReceiptPersistence.recordReceipt({
        enrollmentId: required(enrollmentId, "enrollmentId"),
        vaultReceiptId: required(vaultReceiptId, "vaultReceiptId"),
        envelopeMetadata,
        auditDigest,
        recordedAt,
      });
    },

    async createLabAccessAuthorization({
      vaultReceiptId,
      authorizationId,
      purposeCode,
      issuedAt,
      expiresAt,
    } = {}) {
      assertNoRawPayload({ vaultReceiptId, authorizationId, purposeCode, issuedAt, expiresAt });
      const receipt = await revocationGate.getUsableReceipt(
        required(vaultReceiptId, "vaultReceiptId"),
        { now: issuedAt },
      );
      if (receipt === null) {
        fail("template_vault_receipt_not_found", "template vault receipt was not found");
      }
      return createTemplateVaultAccessAuthorization({
        authorizationId,
        vaultReceipt: receipt,
        purposeCode,
        issuedAt,
        expiresAt,
      });
    },

    async getAuthorizedReceipt({
      vaultReceiptId,
      authorization,
      purposeCode,
      now,
    } = {}) {
      assertNoRawPayload({ vaultReceiptId, authorization, purposeCode, now });
      return authorizedReceiptAccess.getAuthorizedReceipt({
        vaultReceiptId: required(vaultReceiptId, "vaultReceiptId"),
        authorization,
        purposeCode,
        now,
      });
    },

    async createLabRevocationAuthorization({
      enrollmentId,
      authorizationId,
      consentLedgerDigest,
      reasonCode,
      issuedAt,
      expiresAt,
    } = {}) {
      assertNoRawPayload({ enrollmentId, authorizationId, consentLedgerDigest, reasonCode, issuedAt, expiresAt });
      const manifest = await enrollmentPersistence.getEnrollment(
        required(enrollmentId, "enrollmentId"),
        { now: issuedAt },
      );
      if (manifest === null) {
        fail("enrollment_not_found", "enrollment was not found");
      }
      return createEnrollmentRevocationAuthorization({
        authorizationId,
        enrollmentManifest: manifest,
        consentLedgerDigest,
        reasonCode,
        issuedAt,
        expiresAt,
      });
    },

    async revokeEnrollment({
      enrollmentId,
      authorization,
      reasonCode,
      revokedAt,
    } = {}) {
      assertNoRawPayload({ enrollmentId, authorization, reasonCode, revokedAt });
      return revocationPersistence.revokeEnrollment({
        enrollmentId: required(enrollmentId, "enrollmentId"),
        authorization,
        reasonCode,
        revokedAt,
      });
    },

    async getLifecycleSnapshot({
      enrollmentId,
      vaultReceiptId,
      now,
    } = {}) {
      assertNoRawPayload({ enrollmentId, vaultReceiptId, now });
      const normalizedEnrollmentId = required(enrollmentId, "enrollmentId");
      const normalizedReceiptId = required(vaultReceiptId, "vaultReceiptId");
      const lifecycle = await revocationPersistence.getEnrollmentLifecycle(
        normalizedEnrollmentId,
        { now },
      );
      if (lifecycle === null) return null;
      const receiptDecision = await revocationGate.evaluateReceiptAccess(
        normalizedReceiptId,
        { now },
      );
      if (receiptDecision === null) {
        fail("template_vault_receipt_not_found", "template vault receipt was not found");
      }
      if (receiptDecision.enrollmentId !== normalizedEnrollmentId) {
        fail(
          "governed_template_vault_flow_enrollment_receipt_mismatch",
          "vault receipt does not belong to enrollment",
        );
      }
      return Object.freeze({
        version: "trust-face-governed-template-vault-lifecycle-snapshot/v1",
        enrollmentId: normalizedEnrollmentId,
        vaultReceiptId: normalizedReceiptId,
        enrollmentManifestDigest: lifecycle.enrollmentManifestDigest,
        lifecycleState: lifecycle.state,
        receiptAccessGranted: receiptDecision.accessGranted,
        receiptAccessDecision: receiptDecision.decision,
        revocationDigest: lifecycle.revocationDigest,
        revokedAt: lifecycle.revokedAt,
        metadataOnly: true,
        biometricTemplateStored: false,
        encryptionPerformed: false,
        realVaultReady: false,
        productionReady: false,
        biometricClaimReady: false,
      });
    },
  });
}
