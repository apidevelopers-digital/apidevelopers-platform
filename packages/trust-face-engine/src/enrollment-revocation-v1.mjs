import { createHash } from "node:crypto";
import { assertEnrollmentManifest } from "./enrollment-manifest-v1.mjs";

export const TRUST_FACE_ENROLLMENT_REVOCATION_V1 = Object.freeze({
  version: "trust-face-enrollment-revocation/v1",
  purpose: "revoke-governed-enrollment-manifest",
  collection: "trust-face-enrollment-revocations-v1",
  idField: "enrollmentId",
  allowedReasonCodes: Object.freeze([
    "consent-withdrawn",
    "subject-request",
    "security-response",
    "superseded",
    "administrative-policy",
  ]),
  appendOnly: true,
  hardDeleteAllowed: false,
  enrollmentMutationAllowed: false,
  templateDeletionPerformed: false,
  templatePayloadPersisted: false,
  rawBiometricsRetained: false,
  rawEmbeddingsRetained: false,
  authorizationRequired: true,
  realEnrollmentReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

const RAW_FIELDS = Object.freeze([
  "image", "imageData", "rawImage", "pixels", "video", "videoData", "frames",
  "bytes", "buffer", "embedding", "embeddings", "vector", "vectors",
  "template", "biometricTemplate", "templatePayload",
]);

export class TrustFaceEnrollmentRevocationV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceEnrollmentRevocationV1Error";
    this.code = code;
  }
}

function fail(code, message) {
  throw new TrustFaceEnrollmentRevocationV1Error(code, message);
}

function text(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_enrollment_revocation_field", `${field} is required`);
  return value.trim();
}

function digest(value, field) {
  const normalized = text(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    fail("invalid_enrollment_revocation_digest", `${field} must be sha256:<64 hex>`);
  }
  return normalized;
}

function iso(value, field) {
  const normalized = text(value, field);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) fail("invalid_enrollment_revocation_time", `${field} must be ISO-8601`);
  return Object.freeze({ iso: new Date(ms).toISOString(), ms });
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

function assertNoRawPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("enrollment_revocation_input_required", "revocation input must be an object");
  }
  for (const field of RAW_FIELDS) {
    if (field in input) fail("raw_enrollment_revocation_payload_forbidden", `${field} is forbidden`);
  }
}

function reasonCode(value) {
  const normalized = text(value, "reasonCode");
  if (!TRUST_FACE_ENROLLMENT_REVOCATION_V1.allowedReasonCodes.includes(normalized)) {
    fail("invalid_enrollment_revocation_reason", "reasonCode is not allowed");
  }
  return normalized;
}

function policy() {
  return Object.freeze({
    appendOnly: true,
    hardDeleteAllowed: false,
    enrollmentMutationAllowed: false,
    templateDeletionPerformed: false,
    templatePayloadPersisted: false,
    rawBiometricsRetained: false,
    rawEmbeddingsRetained: false,
    authorizationRequired: true,
    realEnrollmentReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

function body({
  enrollmentId,
  enrollmentManifestDigest,
  revocationAuthorizationDigest,
  reasonCode: revocationReasonCode,
  revokedAt,
}) {
  return Object.freeze({
    version: TRUST_FACE_ENROLLMENT_REVOCATION_V1.version,
    purpose: TRUST_FACE_ENROLLMENT_REVOCATION_V1.purpose,
    enrollmentId,
    enrollmentManifestDigest,
    revocationAuthorizationDigest,
    reasonCode: revocationReasonCode,
    revokedAt,
    previousState: "active",
    nextState: "revoked",
    ...policy(),
  });
}

export function createEnrollmentRevocation(input = {}) {
  assertNoRawPayload(input);
  const revocationBody = body({
    enrollmentId: text(input.enrollmentId, "enrollmentId"),
    enrollmentManifestDigest: digest(input.enrollmentManifestDigest, "enrollmentManifestDigest"),
    revocationAuthorizationDigest: digest(input.revocationAuthorizationDigest, "revocationAuthorizationDigest"),
    reasonCode: reasonCode(input.reasonCode),
    revokedAt: iso(input.revokedAt, "revokedAt").iso,
  });
  return Object.freeze({ ...revocationBody, revocationDigest: sha256(revocationBody) });
}

export function assertEnrollmentRevocation({
  revocation,
  enrollmentManifest,
  now = null,
} = {}) {
  if (!revocation || typeof revocation !== "object" || Array.isArray(revocation)) {
    fail("enrollment_revocation_required", "revocation is required");
  }
  if (revocation.version !== TRUST_FACE_ENROLLMENT_REVOCATION_V1.version) {
    fail("enrollment_revocation_version_mismatch", "unsupported enrollment revocation version");
  }
  if (revocation.purpose !== TRUST_FACE_ENROLLMENT_REVOCATION_V1.purpose) {
    fail("enrollment_revocation_purpose_mismatch", "enrollment revocation purpose mismatch");
  }
  if (revocation.previousState !== "active" || revocation.nextState !== "revoked") {
    fail("enrollment_revocation_state_mismatch", "revocation must transition active to revoked");
  }

  const expectedPolicy = policy();
  for (const [field, value] of Object.entries(expectedPolicy)) {
    if (revocation[field] !== value) {
      fail("enrollment_revocation_policy_mismatch", `enrollment revocation ${field} mismatch`);
    }
  }

  const checkedManifest = assertEnrollmentManifest({ manifest: enrollmentManifest, now });
  const normalized = {
    enrollmentId: text(revocation.enrollmentId, "revocation.enrollmentId"),
    enrollmentManifestDigest: digest(revocation.enrollmentManifestDigest, "revocation.enrollmentManifestDigest"),
    revocationAuthorizationDigest: digest(revocation.revocationAuthorizationDigest, "revocation.revocationAuthorizationDigest"),
    reasonCode: reasonCode(revocation.reasonCode),
    revokedAt: iso(revocation.revokedAt, "revocation.revokedAt"),
  };

  if (normalized.enrollmentId !== checkedManifest.enrollmentId) {
    fail("enrollment_revocation_enrollment_mismatch", "revocation enrollmentId does not match enrollment manifest");
  }
  if (normalized.enrollmentManifestDigest !== checkedManifest.manifestDigest) {
    fail("enrollment_revocation_manifest_digest_mismatch", "revocation manifest digest does not match enrollment manifest");
  }

  const enrolledAt = iso(checkedManifest.enrolledAt, "enrollmentManifest.enrolledAt");
  if (normalized.revokedAt.ms < enrolledAt.ms) {
    fail("enrollment_revocation_before_enrollment", "revokedAt cannot be before enrolledAt");
  }
  if (now !== null && normalized.revokedAt.ms > iso(now, "now").ms) {
    fail("enrollment_revocation_from_future", "revokedAt is after now");
  }

  const expectedBody = body({
    enrollmentId: normalized.enrollmentId,
    enrollmentManifestDigest: normalized.enrollmentManifestDigest,
    revocationAuthorizationDigest: normalized.revocationAuthorizationDigest,
    reasonCode: normalized.reasonCode,
    revokedAt: normalized.revokedAt.iso,
  });
  for (const [field, value] of Object.entries(expectedBody)) {
    if (stable(revocation[field]) !== stable(value)) {
      fail(`enrollment_revocation_${field}_mismatch`, `enrollment revocation ${field} mismatch`);
    }
  }

  const expectedDigest = sha256(expectedBody);
  if (revocation.revocationDigest !== expectedDigest) {
    fail("enrollment_revocation_digest_mismatch", "enrollment revocation digest mismatch");
  }

  return Object.freeze({
    valid: true,
    enrollmentId: normalized.enrollmentId,
    state: "revoked",
    enrollmentManifestDigest: normalized.enrollmentManifestDigest,
    revocationAuthorizationDigest: normalized.revocationAuthorizationDigest,
    reasonCode: normalized.reasonCode,
    revokedAt: normalized.revokedAt.iso,
    revocationDigest: expectedDigest,
    ...expectedPolicy,
  });
}

function assertRepositories(enrollmentRepository, revocationRepository) {
  if (!enrollmentRepository || typeof enrollmentRepository.getById !== "function") {
    fail("invalid_enrollment_repository", "enrollmentRepository must provide getById");
  }
  if (
    !revocationRepository ||
    typeof revocationRepository.create !== "function" ||
    typeof revocationRepository.getById !== "function" ||
    typeof revocationRepository.list !== "function"
  ) {
    fail("invalid_enrollment_revocation_repository", "revocationRepository must provide create, getById and list");
  }
}

export function createEnrollmentRevocationPersistence({
  enrollmentRepository,
  revocationRepository,
} = {}) {
  assertRepositories(enrollmentRepository, revocationRepository);

  return Object.freeze({
    version: "trust-face-enrollment-revocation-persistence/v1",
    collection: TRUST_FACE_ENROLLMENT_REVOCATION_V1.collection,
    idField: TRUST_FACE_ENROLLMENT_REVOCATION_V1.idField,
    appendOnly: true,
    hardDeleteAllowed: false,
    enrollmentMutationAllowed: false,
    templateDeletionPerformed: false,
    realEnrollmentReady: false,
    productionReady: false,
    biometricClaimReady: false,

    async revokeEnrollment({
      enrollmentId,
      revocationAuthorizationDigest,
      reasonCode: revocationReasonCode,
      revokedAt,
    } = {}) {
      const normalizedId = text(enrollmentId, "enrollmentId");
      const enrollmentManifest = await enrollmentRepository.getById(normalizedId);
      if (enrollmentManifest === null) fail("enrollment_not_found", "enrollment was not found");

      const checkedManifest = assertEnrollmentManifest({
        manifest: enrollmentManifest,
        now: revokedAt,
      });

      const existing = await revocationRepository.getById(normalizedId);
      if (existing !== null) {
        assertEnrollmentRevocation({
          revocation: existing,
          enrollmentManifest,
          now: null,
        });
        fail("enrollment_already_revoked", "enrollment is already revoked");
      }

      const revocation = createEnrollmentRevocation({
        enrollmentId: normalizedId,
        enrollmentManifestDigest: checkedManifest.manifestDigest,
        revocationAuthorizationDigest,
        reasonCode: revocationReasonCode,
        revokedAt,
      });

      let persisted;
      try {
        persisted = await revocationRepository.create(revocation);
      } catch (error) {
        if (error?.code === "record_conflict") {
          const concurrent = await revocationRepository.getById(normalizedId);
          if (concurrent !== null) {
            assertEnrollmentRevocation({
              revocation: concurrent,
              enrollmentManifest,
              now: null,
            });
            fail("enrollment_already_revoked", "enrollment is already revoked");
          }
        }
        throw error;
      }

      assertEnrollmentRevocation({
        revocation: persisted,
        enrollmentManifest,
        now: revokedAt,
      });
      return persisted;
    },

    async getEnrollmentLifecycle(enrollmentId, { now = null } = {}) {
      const normalizedId = text(enrollmentId, "enrollmentId");
      const enrollmentManifest = await enrollmentRepository.getById(normalizedId);
      if (enrollmentManifest === null) return null;

      const checkedManifest = assertEnrollmentManifest({
        manifest: enrollmentManifest,
        now,
      });
      const revocation = await revocationRepository.getById(normalizedId);
      if (revocation === null) {
        return Object.freeze({
          enrollmentId: normalizedId,
          state: "active",
          enrollmentManifestDigest: checkedManifest.manifestDigest,
          enrolledAt: checkedManifest.enrolledAt,
          revocationDigest: null,
          revokedAt: null,
          reasonCode: null,
          revocationAuthorizationDigest: null,
          hardDeleted: false,
          realEnrollmentReady: false,
          productionReady: false,
          biometricClaimReady: false,
        });
      }

      const checkedRevocation = assertEnrollmentRevocation({
        revocation,
        enrollmentManifest,
        now,
      });
      return Object.freeze({
        enrollmentId: normalizedId,
        state: "revoked",
        enrollmentManifestDigest: checkedManifest.manifestDigest,
        enrolledAt: checkedManifest.enrolledAt,
        revocationDigest: checkedRevocation.revocationDigest,
        revokedAt: checkedRevocation.revokedAt,
        reasonCode: checkedRevocation.reasonCode,
        revocationAuthorizationDigest: checkedRevocation.revocationAuthorizationDigest,
        hardDeleted: false,
        realEnrollmentReady: false,
        productionReady: false,
        biometricClaimReady: false,
      });
    },

    async listRevocations({ now = null } = {}) {
      const records = await revocationRepository.list({ where: {} });
      if (!Array.isArray(records)) {
        fail("invalid_enrollment_revocation_repository_result", "revocationRepository.list must return an array");
      }
      const verified = [];
      for (const revocation of records) {
        const enrollmentManifest = await enrollmentRepository.getById(revocation?.enrollmentId);
        if (enrollmentManifest === null) {
          fail("orphan_enrollment_revocation", "revocation references a missing enrollment");
        }
        assertEnrolmentRevocation({ revocation, enrollmentManifest, now });
        verified.push(revocation);
      }
      return Object.freeze([...verified]);
    },
  });
}
