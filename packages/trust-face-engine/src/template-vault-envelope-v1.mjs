import { createHash } from "node:crypto";

import { assertEnrollmentManifest } from "./enrollment-manifest-v1.mjs";

export const TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_V1 = Object.freeze({
  version: "trust-face-template-vault-envelope/v1",
  purpose: "bind-enrollment-to-encrypted-template-envelope-metadata",
  storageMode: "simulation-metadata-only",
  algorithm: "AES-256-GCM",
  enrollmentManifestBindingRequired: true,
  ciphertextDigestRequired: true,
  keyReferenceRequired: true,
  plaintextTemplateAccepted: false,
  ciphertextPayloadAccepted: false,
  keyMaterialAccepted: false,
  rawBiometricPayloadAccepted: false,
  rawEmbeddingAccepted: false,
  templatePayloadPersisted: false,
  kmsIntegrated: false,
  cryptographicErasureReady: false,
  realTemplateStorageReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

const FORBIDDEN_FIELDS = Object.freeze([
  "image", "imageData", "rawImage", "pixels", "video", "videoData", "frames",
  "embedding", "embeddings", "vector", "vectors", "template", "templatePayload",
  "plaintext", "plaintextTemplate", "ciphertext", "ciphertextPayload",
  "key", "keyBytes", "keyMaterial", "rawKey", "privateKey",
]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceTemplateVaultEnvelopeV1Error";
  error.code = code;
  throw error;
}

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_vault_field", `${field} is required`);
  }
  return value.trim();
}

function digest(value, field) {
  const normalized = required(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    fail("invalid_vault_digest", `${field} must be sha256:<64 hex>`);
  }
  return normalized;
}

function iso(value, field) {
  const normalized = required(value, field);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) fail("invalid_vault_time", `${field} must be ISO-8601`);
  return Object.freeze({ iso: new Date(ms).toISOString(), ms });
}

function assertNoPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("vault_input_required", "vault input must be an object");
  }
  for (const field of FORBIDDEN_FIELDS) {
    if (field in input) fail("vault_payload_forbidden", `${field} is forbidden`);
  }
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

function body({
  vaultRecordId,
  enrollmentId,
  enrollmentManifestDigest,
  templateDigest,
  algorithm,
  keyRef,
  keyVersion,
  ciphertextDigest,
  nonceDigest,
  aadDigest,
  createdAt,
}) {
  return Object.freeze({
    version: TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_V1.version,
    purpose: TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_V1.purpose,
    storageMode: TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_V1.storageMode,
    vaultRecordId,
    enrollmentId,
    enrollmentManifestDigest,
    templateDigest,
    algorithm,
    keyRef,
    keyVersion,
    ciphertextDigest,
    nonceDigest,
    aadDigest,
    createdAt,
    state: "sealed-simulated",
    plaintextTemplateAccepted: false,
    ciphertextPayloadAccepted: false,
    keyMaterialAccepted: false,
    rawBiometricPayloadAccepted: false,
    rawEmbeddingAccepted: false,
    templatePayloadPersisted: false,
    kmsIntegrated: false,
    cryptographicErasureReady: false,
    realTemplateStorageReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

function normalizedBody({ envelope, enrollmentManifest, now = null }) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    fail("vault_envelope_required", "vault envelope is required");
  }
  const manifest = assertEnrollmentManifest({ manifest: enrollmentManifest, now: now ?? envelope.createdAt });
  if (envelope.version !== TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_V1.version) fail("vault_envelope_version_mismatch", "vault envelope version mismatch");
  if (envelope.purpose !== TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_V1.purpose) fail("vault_envelope_purpose_mismatch", "vault envelope purpose mismatch");
  if (envelope.storageMode !== TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_V1.storageMode) fail("vault_envelope_storage_mode_mismatch", "vault envelope storage mode mismatch");
  if (envelope.state !== "sealed-simulated") fail("vault_envelope_state_mismatch", "vault envelope state mismatch");

  const flags = {
    plaintextTemplateAccepted: false,
    ciphertextPayloadAccepted: false,
    keyMaterialAccepted: false,
    rawBiometricPayloadAccepted: false,
    rawEmbeddingAccepted: false,
    templatePayloadPersisted: false,
    kmsIntegrated: false,
    cryptographicErasureReady: false,
    realTemplateStorageReady: false,
    productionReady: false,
    biometricClaimReady: false,
  };
  for (const [field, expected] of Object.entries(flags)) {
    if (envelope[field] !== expected) fail("vault_envelope_policy_mismatch", `vault envelope ${field} mismatch`);
  }

  const created = iso(envelope.createdAt, "envelope.createdAt");
  if (now !== null && created.ms > iso(now, "now").ms) fail("vault_envelope_from_future", "vault envelope createdAt is after now");

  const normalized = body({
    vaultRecordId: required(envelope.vaultRecordId, "envelope.vaultRecordId"),
    enrollmentId: required(envelope.enrollmentId, "envelope.enrollmentId"),
    enrollmentManifestDigest: digest(envelope.enrollmentManifestDigest, "envelope.enrollmentManifestDigest"),
    templateDigest: digest(envelope.templateDigest, "envelope.templateDigest"),
    algorithm: required(envelope.algorithm, "envelope.algorithm"),
    keyRef: required(envelope.keyRef, "envelope.keyRef"),
    keyVersion: required(envelope.keyVersion, "envelope.keyVersion"),
    ciphertextDigest: digest(envelope.ciphertextDigest, "envelope.ciphertextDigest"),
    nonceDigest: digest(envelope.nonceDigest, "envelope.nonceDigest"),
    aadDigest: digest(envelope.aadDigest, "envelope.aadDigest"),
    createdAt: created.iso,
  });

  if (normalized.algorithm !== TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_V1.algorithm) fail("vault_algorithm_not_allowed", "vault algorithm is not allowed");
  if (normalized.enrollmentId !== manifest.enrollmentId) fail("vault_enrollment_mismatch", "vault enrollmentId mismatch");
  if (normalized.enrollmentManifestDigest !== manifest.manifestDigest) fail("vault_manifest_digest_mismatch", "vault manifest digest mismatch");
  if (normalized.templateDigest !== manifest.templateDigest) fail("vault_template_digest_mismatch", "vault template digest mismatch");

  return Object.freeze({ normalized, manifest });
}

export function createTemplateVaultEnvelope({
  vaultRecordId,
  enrollmentManifest,
  algorithm = TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_V1.algorithm,
  keyRef,
  keyVersion,
  ciphertextDigest,
  nonceDigest,
  aadDigest,
  createdAt,
  ...rest
} = {}) {
  assertNoPayload(rest);
  const manifest = assertEnrollmentManifest({ manifest: enrollmentManifest, now: createdAt });
  const created = iso(createdAt, "createdAt");
  const envelopeBody = body({
    vaultRecordId: required(vaultRecordId, "vaultRecordId"),
    enrollmentId: manifest.enrollmentId,
    enrollmentManifestDigest: manifest.manifestDigest,
    templateDigest: manifest.templateDigest,
    algorithm: required(algorithm, "algorithm"),
    keyRef: required(keyRef, "keyRef"),
    keyVersion: required(keyVersion, "keyVersion"),
    ciphertextDigest: digest(ciphertextDigest, "ciphertextDigest"),
    nonceDigest: digest(nonceDigest, "nonceDigest"),
    aadDigest: digest(aadDigest, "aadDigest"),
    createdAt: created.iso,
  });
  if (envelopeBody.algorithm !== TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_V1.algorithm) {
    fail("vault_algorithm_not_allowed", "vault algorithm is not allowed");
  }
  return Object.freeze({ ...envelopeBody, envelopeDigest: sha256(envelopeBody) });
}

export function assertTemplateVaultEnvelope({ envelope, enrollmentManifest, now = null } = {}) {
  const { normalized, manifest } = normalizedBody({ envelope, enrollmentManifest, now });
  const expectedDigest = sha256(normalized);
  if (envelope.envelopeDigest !== expectedDigest) fail("vault_envelope_digest_mismatch", "vault envelope digest mismatch");
  return Object.freeze({
    valid: true,
    vaultRecordId: normalized.vaultRecordId,
    enrollmentId: manifest.enrollmentId,
    enrollmentManifestDigest: manifest.manifestDigest,
    templateDigest: manifest.templateDigest,
    envelopeDigest: expectedDigest,
    realTemplateStorageReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function createTemplateVaultPersistence({ repository } = {}) {
  if (!repository || typeof repository.create !== "function" || typeof repository.getById !== "function") {
    fail("invalid_vault_repository", "repository must provide create and getById");
  }
  return Object.freeze({
    version: "trust-face-template-vault-persistence/v1",
    storageMode: "simulation-metadata-only",
    decryptAvailable: false,
    unwrapKeyAvailable: false,
    hardDeleteAvailable: false,
    templatePayloadPersisted: false,
    kmsIntegrated: false,
    realTemplateStorageReady: false,
    productionReady: false,
    biometricClaimReady: false,

    async storeEnvelope(input) {
      const envelope = createTemplateVaultEnvelope(input);
      const persisted = await repository.create(envelope);
      assertTemplateVaultEnvelope({ envelope: persisted, enrollmentManifest: input.enrollmentManifest, now: input.createdAt });
      return persisted;
    },

    async getEnvelope(vaultRecordId, { enrollmentManifest, now = null } = {}) {
      const id = required(vaultRecordId, "vaultRecordId");
      const envelope = await repository.getById(id);
      if (envelope === null) return null;
      assertTemplateVaultEnvelope({ envelope, enrollmentManifest, now });
      return envelope;
    },
  });
}
