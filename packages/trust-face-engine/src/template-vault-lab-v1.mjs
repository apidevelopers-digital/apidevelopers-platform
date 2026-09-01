import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const TRUST_FACE_TEMPLATE_VAULT_LAB_V1 = Object.freeze({
  version: "trust-face-template-vault-lab/v1",
  purpose: "simulate-encrypted-template-envelope-storage",
  algorithm: "aes-256-gcm",
  payloadClass: "synthetic-template-fixture",
  keyMaterialPersisted: false,
  rawKeyReturned: false,
  rawBiometricPayloadAccepted: false,
  realTemplateAccepted: false,
  cryptoErasurePerformed: false,
  productionKmsReady: false,
  realEnrollmentReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceTemplateVaultLabV1Error";
  error.code = code;
  throw error;
}

function text(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_vault_field", `${field} is required`);
  return value.trim();
}

function digest(value, field) {
  const normalized = text(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) fail("invalid_vault_digest", `${field} must be sha256:<64 hex>`);
  return normalized;
}

function sha256Buffer(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256Text(value) {
  return sha256Buffer(Buffer.from(value, "utf8"));
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64url(value, field) {
  const normalized = text(value, field);
  const buffer = Buffer.from(normalized, "base64url");
  if (!buffer.length) fail("invalid_vault_encoding", `${field} is empty`);
  return buffer;
}

function keyMaterial(value) {
  const key = Buffer.from(value ?? []);
  if (key.length !== 32) fail("invalid_vault_key_material", "key material must be exactly 32 bytes for lab AES-256-GCM");
  return key;
}

function assertSyntheticPayload(payload, payloadClass) {
  if (payloadClass !== TRUST_FACE_TEMPLATE_VAULT_LAB_V1.payloadClass) {
    fail("real_template_payload_forbidden", "only synthetic-template-fixture payloads are allowed");
  }
  if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) return Buffer.from(payload);
  if (typeof payload === "string" && payload.length > 0) return Buffer.from(payload, "utf8");
  fail("invalid_vault_payload", "synthetic payload must be non-empty bytes or text");
}

function aadFor({ templateRef, templateDigest, modelVersion, keyRef, payloadClass }) {
  return JSON.stringify({ keyRef, modelVersion, payloadClass, templateDigest, templateRef });
}

export function createTemplateVaultLabEnvelope({
  templateRef,
  templateDigest,
  modelVersion,
  keyRef,
  key,
  payload,
  payloadClass = TRUST_FACE_TEMPLATE_VAULT_LAB_V1.payloadClass,
  nonce = randomBytes(12),
  createdAt = new Date().toISOString(),
} = {}) {
  const normalized = {
    templateRef: text(templateRef, "templateRef"),
    templateDigest: digest(templateDigest, "templateDigest"),
    modelVersion: text(modelVersion, "modelVersion"),
    keyRef: text(keyRef, "keyRef"),
    payloadClass,
  };
  const plaintext = assertSyntheticPayload(payload, payloadClass);
  if (sha256Buffer(plaintext) !== normalized.templateDigest) {
    fail("template_digest_mismatch", "templateDigest does not match synthetic payload");
  }
  const normalizedKey = keyMaterial(key);
  const normalizedNonce = Buffer.from(nonce ?? []);
  if (normalizedNonce.length !== 12) fail("invalid_vault_nonce", "nonce must be exactly 12 bytes");
  const aad = aadFor(normalized);
  const cipher = createCipheriv("aes-256-gcm", normalizedKey, normalizedNonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Object.freeze({
    version: TRUST_FACE_TEMPLATE_VAULT_LAB_V1.version,
    purpose: TRUST_FACE_TEMPLATE_VAULT_LAB_V1.purpose,
    algorithm: TRUST_FACE_TEMPLATE_VAULT_LAB_V1.algorithm,
    ...normalized,
    nonce: base64url(normalizedNonce),
    ciphertext: base64url(ciphertext),
    authTag: base64url(authTag),
    aadDigest: sha256Text(aad),
    createdAt: new Date(createdAt).toISOString(),
    keyMaterialPersisted: false,
    rawKeyReturned: false,
    rawBiometricPayloadAccepted: false,
    realTemplateAccepted: false,
    cryptoErasurePerformed: false,
    productionKmsReady: false,
    realEnrollmentReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function assertTemplateVaultLabEnvelope({ envelope, expected = {}, now = null } = {}) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) fail("vault_envelope_required", "envelope is required");
  const P = TRUST_FACE_TEMPLATE_VAULT_LAB_V1;
  if (envelope.version !== P.version || envelope.purpose !== P.purpose || envelope.algorithm !== P.algorithm) {
    fail("vault_envelope_profile_mismatch", "vault envelope profile mismatch");
  }
  for (const [field, value] of Object.entries({
    keyMaterialPersisted: false,
    rawKeyReturned: false,
    rawBiometricPayloadAccepted: false,
    realTemplateAccepted: false,
    cryptoErasurePerformed: false,
    productionKmsReady: false,
    realEnrollmentReady: false,
    productionReady: false,
    biometricClaimReady: false,
  })) {
    if (envelope[field] !== value) fail("vault_envelope_policy_mismatch", `vault envelope ${field} mismatch`);
  }

  const normalized = {
    templateRef: text(envelope.templateRef, "envelope.templateRef"),
    templateDigest: digest(envelope.templateDigest, "envelope.templateDigest"),
    modelVersion: text(envelope.modelVersion, "envelope.modelVersion"),
    keyRef: text(envelope.keyRef, "envelope.keyRef"),
    payloadClass: text(envelope.payloadClass, "envelope.payloadClass"),
  };
  if (normalized.payloadClass !== P.payloadClass) fail("real_template_payload_forbidden", "vault envelope payload class is not synthetic");
  const nonce = fromBase64url(envelope.nonce, "envelope.nonce");
  const ciphertext = fromBase64url(envelope.ciphertext, "envelope.ciphertext");
  const authTag = fromBase64url(envelope.authTag, "envelope.authTag");
  if (nonce.length !== 12 || authTag.length !== 16 || ciphertext.length < 1) fail("vault_envelope_encoding_mismatch", "vault envelope crypto fields are invalid");
  const aad = aadFor(normalized);
  if (envelope.aadDigest !== sha256Text(aad)) fail("vault_envelope_aad_digest_mismatch", "vault envelope AAD digest mismatch");
  const createdMs = Date.parse(text(envelope.createdAt, "envelope.createdAt"));
  if (!Number.isFinite(createdMs)) fail("invalid_vault_time", "createdAt must be ISO-8601");
  if (now !== null && createdMs > Date.parse(text(now, "now"))) fail("vault_envelope_from_future", "vault envelope createdAt is after now");

  for (const [field, value] of Object.entries(expected)) {
    if (value !== undefined && normalized[field] !== value) fail(`vault_envelope_${field}_mismatch`, `vault envelope ${field} mismatch`);
  }
  return Object.freeze({ valid: true, ...normalized, createdAt: new Date(createdMs).toISOString() });
}

export function decryptTemplateVaultLabEnvelope({ envelope, key, expected = {}, now = null } = {}) {
  const checked = assertTemplateVaultLabEnvelope({ envelope, expected, now });
  const aad = aadFor(checked);
  const decipher = createDecipheriv("aes-256-gcm", keyMaterial(key), fromBase64url(envelope.nonce, "envelope.nonce"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(fromBase64url(envelope.authTag, "envelope.authTag"));
  let plaintext;
  try {
    plaintext = Buffer.concat([
      decipher.update(fromBase64url(envelope.ciphertext, "envelope.ciphertext")),
      decipher.final(),
    ]);
  } catch {
    fail("vault_envelope_authentication_failed", "vault envelope authentication failed");
  }
  if (sha256Buffer(plaintext) !== checked.templateDigest) fail("vault_plaintext_digest_mismatch", "decrypted payload digest mismatch");
  return plaintext;
}

export function createTemplateVaultLabPersistence({ repository } = {}) {
  if (!repository || typeof repository.create !== "function" || typeof repository.getById !== "function" || typeof repository.list !== "function") {
    fail("invalid_vault_repository", "repository must provide create, getById and list");
  }
  return Object.freeze({
    version: "trust-face-template-vault-lab-persistence/v1",
    labOnly: true,
    keyMaterialPersisted: false,
    hardDeleteAllowed: false,
    cryptoErasurePerformed: false,
    productionKmsReady: false,
    productionReady: false,
    async storeTemplate(input) {
      const envelope = createTemplateVaultLabEnvelope(input);
      return repository.create({ id: envelope.templateRef, ...envelope });
    },
    async getTemplateEnvelope(templateRef, { now = null } = {}) {
      const record = await repository.getById(text(templateRef, "templateRef"));
      if (record === null) return null;
      assertTemplateVaultLabEnvelope({ envelope: record, now });
      return record;
    },
    async listTemplateEnvelopes({ now = null } = {}) {
      const records = await repository.list({ where: {} });
      if (!Array.isArray(records)) fail("invalid_vault_repository_result", "repository.list must return an array");
      for (const record of records) assertTemplateVaultLabEnvelope({ envelope: record, now });
      return Object.freeze([...records]);
    },
  });
}
