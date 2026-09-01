import { createHash } from "node:crypto";

export const TRUST_FACE_ENROLLMENT_MANIFEST_V1 = Object.freeze({
  version: "trust-face-enrollment-manifest/v1",
  purpose: "persist-governed-enrollment-template-reference",
  collection: "trust-face-enrollment-manifests-v1",
  idField: "enrollmentId",
  metadataOnly: true,
  templatePayloadPersisted: false,
  rawBiometricsRetained: false,
  rawEmbeddingsRetained: false,
  consentRequired: true,
  authorizationRequired: true,
  immutableRecord: true,
  realEnrollmentReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

const RAW_FIELDS = Object.freeze([
  "image", "imageData", "rawImage", "pixels", "video", "videoData", "frames",
  "bytes", "buffer", "embedding", "embeddings", "vector", "vectors",
  "template", "biometricTemplate", "templatePayload",
]);

export class TrustFaceEnrollmentManifestV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceEnrollmentManifestV1Error";
    this.code = code;
  }
}
function fail(code, message) { throw new TrustFaceEnrollmentManifestV1Error(code, message); }
function text(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_enrollment_field", `${field} is required`);
  return value.trim();
}
function digest(value, field) {
  const normalized = text(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) fail("invalid_enrollment_digest", `${field} must be sha256:<64 hex>`);
  return normalized;
}
function iso(value, field) {
  const normalized = text(value, field);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) fail("invalid_enrollment_time", `${field} must be ISO-8601`);
  return Object.freeze({ iso: new Date(ms).toISOString(), ms });
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function sha256(value) { return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`; }

function assertNoRawPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("enrollment_input_required", "enrollment input must be an object");
  for (const field of RAW_FIELDS) if (field in input) fail("raw_enrollment_payload_forbidden", `${field} is forbidden`);
}

function policy() {
  return Object.freeze({
    metadataOnly: true,
    templatePayloadPersisted: false,
    rawBiometricsRetained: false,
    rawEmbeddingsRetained: false,
    consentRequired: true,
    authorizationRequired: true,
    immutableRecord: true,
    realEnrollmentReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

function body({ enrollmentId, subjectRef, templateRef, templateDigest, modelVersion, consentLedgerDigest, authorizationDigest, enrolledAt }) {
  return Object.freeze({
    version: TRUST_FACE_ENROLLMENT_MANIFEST_V1.version,
    purpose: TRUST_FACE_ENROLLMENT_MANIFEST_V1.purpose,
    enrollmentId, subjectRef, templateRef, templateDigest, modelVersion,
    consentLedgerDigest, authorizationDigest, enrolledAt,
    state: "active",
    ...policy(),
  });
}

export function createEnrollmentManifest(input = {}) {
  assertNoRawPayload(input);
  const normalized = {
    enrollmentId: text(input.enrollmentId, "enrollmentId"),
    subjectRef: text(input.subjectRef, "subjectRef"),
    templateRef: text(input.templateRef, "templateRef"),
    templateDigest: digest(input.templateDigest, "templateDigest"),
    modelVersion: text(input.modelVersion, "modelVersion"),
    consentLedgerDigest: digest(input.consentLedgerDigest, "consentLedgerDigest"),
    authorizationDigest: digest(input.authorizationDigest, "authorizationDigest"),
    enrolledAt: iso(input.enrolledAt, "enrolledAt").iso,
  };
  const manifestBody = body(normalized);
  return Object.freeze({ ...manifestBody, manifestDigest: sha256(manifestBody) });
}

export function assertEnrollmentManifest({ manifest, now = null } = {}) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) fail("enrollment_manifest_required", "enrollment manifest is required");
  if (manifest.version !== TRUST_FACE_ENROLLMENT_MANIFEST_V1.version) fail("enrollment_manifest_version_mismatch", "unsupported enrollment manifest version");
  if (manifest.purpose !== TRUST_FACE_ENROLLMENT_MANIFEST_V1.purpose) fail("enrollment_manifest_purpose_mismatch", "enrollment manifest purpose mismatch");
  if (manifest.state !== "active") fail("enrollment_manifest_state_mismatch", "enrollment manifest must remain active in v1");

  const expectedPolicy = policy();
  for (const [field, value] of Object.entries(expectedPolicy)) {
    if (manifest[field] !== value) fail("enrollment_manifest_policy_mismatch", `enrollment manifest ${field} mismatch`);
  }

  const normalized = {
    enrollmentId: text(manifest.enrollmentId, "manifest.enrollmentId"),
    subjectRef: text(manifest.subjectRef, "manifest.subjectRef"),
    templateRef: text(manifest.templateRef, "manifest.templateRef"),
    templateDigest: digest(manifest.templateDigest, "manifest.templateDigest"),
    modelVersion: text(manifest.modelVersion, "manifest.modelVersion"),
    consentLedgerDigest: digest(manifest.consentLedgerDigest, "manifest.consentLedgerDigest"),
    authorizationDigest: digest(manifest.authorizationDigest, "manifest.authorizationDigest"),
    enrolledAt: iso(manifest.enrolledAt, "manifest.enrolledAt").iso,
  };
  const enrolled = iso(normalized.enrolledAt, "manifest.enrolledAt");
  if (now !== null && enrolled.ms > iso(now, "now").ms) fail("enrollment_manifest_from_future", "enrollment manifest enrolledAt is after now");

  const expectedBody = body(normalized);
  for (const [field, value] of Object.entries(expectedBody)) {
    if (stable(manifest[field]) !== stable(value)) fail(`enrollment_manifest_${field}_mismatch`, `enrollment manifest ${field} mismatch`);
  }
  const expectedDigest = sha256(expectedBody);
  if (manifest.manifestDigest !== expectedDigest) fail("enrollment_manifest_digest_mismatch", "enrollment manifest digest mismatch");

  return Object.freeze({
    valid: true,
    enrollmentId: expectedBody.enrollmentId,
    subjectRef: expectedBody.subjectRef,
    templateRef: expectedBody.templateRef,
    templateDigest: expectedBody.templateDigest,
    modelVersion: expectedBody.modelVersion,
    consentLedgerDigest: expectedBody.consentLedgerDigest,
    authorizationDigest: expectedBody.authorizationDigest,
    enrolledAt: expectedBody.enrolledAt,
    manifestDigest: expectedDigest,
    metadataOnly: true,
    realEnrollmentReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

function assertRepository(repository) {
  if (!repository || typeof repository.create !== "function" || typeof repository.getById !== "function" || typeof repository.list !== "function") {
    fail("invalid_enrollment_repository", "repository must provide create, getById and list");
  }
}

export function createEnrollmentPersistence({ repository } = {}) {
  assertRepository(repository);
  return Object.freeze({
    version: "trust-face-enrollment-persistence/v1",
    collection: TRUST_FACE_ENROLLMENT_MANIFEST_V1.collection,
    idField: TRUST_FACE_ENROLLMENT_MANIFEST_V1.idField,
    metadataOnly: true,
    templatePayloadPersisted: false,
    rawBiometricsRetained: false,
    rawEmbeddingsRetained: false,
    realEnrollmentReady: false,
    productionReady: false,
    biometricClaimReady: false,

    async enroll(input) {
      const manifest = createEnrollmentManifest(input);
      const persisted = await repository.create(manifest);
      assertEnrollmentManifest({ manifest: persisted, now: input.enrolledAt });
      return persisted;
    },

    async getEnrollment(enrollmentId, { now = null } = {}) {
      const normalizedId = text(enrollmentId, "enrollmentId");
      const manifest = await repository.getById(normalizedId);
      if (manifest === null) return null;
      assertEnrollmentManifest({ manifest, now });
      return manifest;
    },

    async listEnrollments({ subjectRef = null, now = null } = {}) {
      const where = subjectRef === null ? {} : { subjectRef: text(subjectRef, "subjectRef") };
      const records = await repository.list({ where });
      if (!Array.isArray(records)) fail("invalid_enrollment_repository_result", "repository.list must return an array");
      for (const manifest of records) assertEnrollmentManifest({ manifest, now });
      return Object.freeze([...records]);
    },
  });
}
