
import { createHash } from "node:crypto";
import { assertEnrollmentManifest } from "./enrollment-manifest-v1.mjs";

export const TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_LAB_V1 = Object.freeze({
  version: "trust-face-template-vault-envelope-lab/v1",
  purpose: "simulate-governed-template-vault-envelope-storage-without-biometric-payload",
  collection: "trust-face-template-vault-envelope-lab-v1",
  idField: "enrollmentId",
  mode: "lab-contract",
  syntheticOnly: true,
  metadataOnly: true,
  ciphertextPayloadPersisted: false,
  plaintextTemplateAllowed: false,
  rawBiometricsAllowed: false,
  rawEmbeddingsAllowed: false,
  keyMaterialPersisted: false,
  keyProviderReady: false,
  encryptionPerformed: false,
  cryptographicOriginAttested: false,
  immutableRecord: true,
  hardDeleteAllowed: false,
  rotationSupported: false,
  realTemplateStorageReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

const FORBIDDEN_FIELDS = Object.freeze([
  "image", "imageData", "rawImage", "pixels",
  "video", "videoData", "frames",
  "bytes", "buffer",
  "embedding", "embeddings", "vector", "vectors",
  "template", "biometricTemplate", "templatePayload",
  "plaintext", "ciphertext",
  "wrappedDataKey", "dataKey", "key", "keyMaterial", "secret",
]);

const CIPHER_SUITE_POLICY = "aes-256-gcm+wrapped-data-key/contract-v1";

export class TrustFaceTemplateVaultEnvelopeLabV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceTemplateVaultEnvelopeLabV1Error";
    this.code = code;
  }
}
function fail(code, message) { throw new TrustFaceTemplateVaultEnvelopeLabV1Error(code, message); }
function text(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_template_vault_field", `${field} is required`);
  return value.trim();
}
function digest(value, field) {
  const normalized = text(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) fail("invalid_template_vault_digest", `${field} must be sha256:<64 hex>`);
  return normalized;
}
function iso(value, field) {
  const normalized = text(value, field);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) fail("invalid_template_vault_time", `${field} must be ISO-8601`);
  return Object.freeze({ iso: new Date(ms).toISOString(), ms });
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(value) { return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`; }
function assertNoPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("template_vault_input_required", "template vault input must be an object");
  for (const field of FORBIDDEN_FIELDS) {
    if (field in input) fail("template_vault_payload_forbidden", `${field} is forbidden`);
  }
}
function policy() {
  return Object.freeze({
    mode: "lab-contract",
    syntheticOnly: true,
    metadataOnly: true,
    ciphertextPayloadPersisted: false,
    plaintextTemplateAllowed: false,
    rawBiometricsAllowed: false,
    rawEmbeddingsAllowed: false,
    keyMaterialPersisted: false,
    keyProviderReady: false,
    encryptionPerformed: false,
    cryptographicOriginAttested: false,
    immutableRecord: true,
    hardDeleteAllowed: false,
    rotationSupported: false,
    realTemplateStorageReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
function body({ enrollmentId, enrollmentManifestDigest, templateRef, templateDigest, modelVersion, vaultRef, sealedObjectDigest, wrappedDataKeyDigest, nonceDigest, keyAlias, createdAt }) {
  return Object.freeze({
    version: TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_LAB_V1.version,
    purpose: TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_LAB_V1.purpose,
    enrollmentId,
    enrollmentManifestDigest,
    templateRef,
    templateDigest,
    modelVersion,
    vaultRef,
    sealedObjectDigest,
    wrappedDataKeyDigest,
    nonceDigest,
    keyAlias,
    cipherSuitePolicy: CIPHER_SUITE_POLICY,
    createdAt,
    state: "active",
    ...policy(),
  });
}

export function createTemplateVaultEnvelopeLabRecord(input = {}) {
  assertNoPayload(input);
  const manifest = assertEnrollmentManifest({ manifest: input.enrollmentManifest, now: input.createdAt ?? null });
  const created = iso(input.createdAt, "createdAt");
  const recordBody = body({
    enrollmentId: manifest.enrollmentId,
    enrollmentManifestDigest: manifest.manifestDigest,
    templateRef: manifest.templateRef,
    templateDigest: manifest.templateDigest,
    modelVersion: manifest.modelVersion,
    vaultRef: text(input.vaultRef, "vaultRef"),
    sealedObjectDigest: digest(input.sealedObjectDigest, "sealedObjectDigest"),
    wrappedDataKeyDigest: digest(input.wrappedDataKeyDigest, "wrappedDataKeyDigest"),
    nonceDigest: digest(input.nonceDigest, "nonceDigest"),
    keyAlias: text(input.keyAlias, "keyAlias"),
    createdAt: created.iso,
  });
  return Object.freeze({ ...recordBody, recordDigest: sha256(recordBody) });
}

export function assertTemplateVaultEnvelopeLabRecord({ record, enrollmentManifest, now = null } = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) fail("template_vault_record_required", "template vault record is required");
  const manifest = assertEnrollmentManifest({ manifest: enrollmentManifest, now });
  if (record.version !== TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_LAB_V1.version) fail("template_vault_version_mismatch", "template vault record version mismatch");
  if (record.purpose !== TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_LAB_V1.purpose) fail("template_vault_purpose_mismatch", "template vault record purpose mismatch");
  if (record.state !== "active") fail("template_vault_state_mismatch", "template vault record must remain active in v1");
  for (const [field, expected] of Object.entries(policy())) {
    if (record[field] !== expected) fail("template_vault_policy_mismatch", `template vault ${field} mismatch`);
  }
  const created = iso(record.createdAt, "record.createdAt");
  if (now !== null && created.ms > iso(now, "now").ms) fail("template_vault_record_from_future", "template vault createdAt is after now");
  const expectedBody = body({
    enrollmentId: manifest.enrollmentId,
    enrollmentManifestDigest: manifest.manifestDigest,
    templateRef: manifest.templateRef,
    templateDigest: manifest.templateDigest,
    modelVersion: manifest.modelVersion,
    vaultRef: text(record.vaultRef, "record.vaultRef"),
    sealedObjectDigest: digest(record.sealedObjectDigest, "record.sealedObjectDigest"),
    wrappedDataKeyDigest: digest(record.wrappedDataKeyDigest, "record.wrappedDataKeyDigest"),
    nonceDigest: digest(record.nonceDigest, "record.nonceDigest"),
    keyAlias: text(record.keyAlias, "record.keyAlias"),
    createdAt: created.iso,
  });
  for (const [field, expected] of Object.entries(expectedBody)) {
    if (stable(record[field]) !== stable(expected)) fail(`template_vault_${field}_mismatch`, `template vault ${field} mismatch`);
  }
  const expectedDigest = sha256(expectedBody);
  if (record.recordDigest !== expectedDigest) fail("template_vault_record_digest_mismatch", "template vault record digest mismatch");
  return Object.freeze({
    valid: true,
    enrollmentId: manifest.enrollmentId,
    enrollmentManifestDigest: manifest.manifestDigest,
    templateDigest: manifest.templateDigest,
    vaultRef: expectedBody.vaultRef,
    recordDigest: expectedDigest,
    syntheticOnly: true,
    ciphertextPayloadPersisted: false,
    keyProviderReady: false,
    encryptionPerformed: false,
    realTemplateStorageReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

function assertRepository(repository) {
  if (!repository || typeof repository.create !== "function" || typeof repository.getById !== "function" || typeof repository.list !== "function") {
    fail("invalid_template_vault_repository", "repository must provide create, getById and list");
  }
}

export function createTemplateVaultEnvelopeLabPersistence({ repository, enrollmentRepository } = {}) {
  assertRepository(repository);
  if (!enrollmentRepository || typeof enrollmentRepository.getById !== "function") fail("invalid_enrollment_repository", "enrollmentRepository must provide getById");
  return Object.freeze({
    version: "trust-face-template-vault-envelope-lab-persistence/v1",
    collection: TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_LAB_V1.collection,
    idField: TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_LAB_V1.idField,
    syntheticOnly: true,
    metadataOnly: true,
    ciphertextPayloadPersisted: false,
    keyMaterialPersisted: false,
    hardDeleteAllowed: false,
    rotationSupported: false,
    realTemplateStorageReady: false,
    productionReady: false,
    biometricClaimReady: false,
    async register(input = {}) {
      const enrollmentId = text(input.enrollmentId, "enrollmentId");
      const manifest = await enrollmentRepository.getById(enrollmentId);
      if (manifest === null) fail("enrollment_not_found", "enrollment was not found");
      const record = createTemplateVaultEnvelopeLabRecord({
        enrollmentManifest: manifest,
        vaultRef: input.vaultRef,
        sealedObjectDigest: input.sealedObjectDigest,
        wrappedDataKeyDigest: input.wrappedDataKeyDigest,
        nonceDigest: input.nonceDigest,
        keyAlias: input.keyAlias,
        createdAt: input.createdAt,
      });
      const persisted = await repository.create(record);
      assertTemplateVaultEnvelopeLabRecord({ record: persisted, enrollmentManifest: manifest, now: input.createdAt });
      return persisted;
    },
    async get(enrollmentId, { now = null } = {}) {
      const normalizedId = text(enrollmentId, "enrollmentId");
      const manifest = await enrollmentRepository.getById(normalizedId);
      if (manifest === null) return null;
      const record = await repository.getById(normalizedId);
      if (record === null) return null;
      assertTemplateVaultEnvelopeLabRecord({ record, enrollmentManifest: manifest, now });
      return record;
    },
    async list({ now = null } = {}) {
      const records = await repository.list();
      if (!Array.isArray(records)) fail("invalid_template_vault_repository_result", "repository.list must return an array");
      for (const record of records) {
        const manifest = await enrollmentRepository.getById(record.enrollmentId);
        if (manifest === null) fail("template_vault_orphan_record", "template vault record has no enrollment manifest");
        assertTemplateVaultEnvelopeLabRecord({ record, enrollmentManifest: manifest, now });
      }
      return Object.freeze([...records]);
    },
  });
}
