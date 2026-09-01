import { createHash } from "node:crypto";

import {
  assertEnrollmentManifest,
} from "./enrollment-manifest-v1.mjs";
import {
  createEnrollmentRevocationPersistence,
} from "./enrollment-revocation-v1.mjs";

export const TRUST_FACE_ENROLLMENT_REVOCATION_AUTHORIZATION_V1 = Object.freeze({
  version: "trust-face-enrollment-revocation-authorization/v1",
  scope: "face-enrollment-revocation",
  allowedReasonCodes: Object.freeze([
    "consent-withdrawn",
    "subject-request",
    "security-response",
    "superseded",
    "administrative-policy",
  ]),
  authorizationObjectRequired: true,
  enrollmentManifestBindingRequired: true,
  consentLedgerBindingRequired: true,
  originalEnrollmentAuthorizationBindingRequired: true,
  hardDeleteAuthorizedByThisGate: false,
  templateDeletionAuthorizedByThisGate: false,
  rawBiometricPayloadAccepted: false,
  rawEmbeddingAccepted: false,
  realEnrollmentReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceEnrollmentRevocationAuthorizationV1Error";
  error.code = code;
  throw error;
}

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_revocation_authorization_field", `${field} is required`);
  }
  return value.trim();
}

function sha256Digest(value, field) {
  const normalized = required(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    fail("invalid_revocation_authorization_digest", `${field} must be sha256:<64 hex>`);
  }
  return normalized;
}

function iso(value, field) {
  const normalized = required(value, field);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) {
    fail("invalid_revocation_authorization_time", `${field} must be ISO-8601`);
  }
  return Object.freeze({ iso: new Date(ms).toISOString(), ms });
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digestObject(value) {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

function reason(value) {
  const normalized = required(value, "reasonCode");
  if (!TRUST_FACE_ENROLLMENT_REVOCATION_AUTHORIZATION_V1.allowedReasonCodes.includes(normalized)) {
    fail("invalid_revocation_authorization_reason", "reasonCode is not allowed");
  }
  return normalized;
}

function body({
  authorizationId,
  enrollmentId,
  enrollmentManifestDigest,
  consentLedgerDigest,
  originalEnrollmentAuthorizationDigest,
  reasonCode,
  issuedAt,
  expiresAt,
}) {
  return Object.freeze({
    version: TRUST_FACE_ENROLLMENT_REVOCATION_AUTHORIZATION_V1.version,
    scope: TRUST_FACE_ENROLLMENT_REVOCATION_AUTHORIZATION_V1.scope,
    authorizationId,
    enrollmentId,
    enrollmentManifestDigest,
    consentLedgerDigest,
    originalEnrollmentAuthorizationDigest,
    reasonCode,
    issuedAt,
    expiresAt,
    revocationAuthorized: true,
    hardDeleteAuthorized: false,
    templateDeletionAuthorized: false,
    authorizationObjectRequired: true,
    enrollmentManifestBindingRequired: true,
    consentLedgerBindingRequired: true,
    originalEnrollmentAuthorizationBindingRequired: true,
    rawBiometricPayloadAccepted: false,
    rawEmbeddingAccepted: false,
    realEnrollmentReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function createEnrollmentRevocationAuthorization({
  authorizationId,
  enrollmentManifest,
  consentLedgerDigest,
  reasonCode,
  issuedAt,
  expiresAt,
  revocationAuthorized = true,
  hardDeleteAuthorized = false,
  templateDeletionAuthorized = false,
} = {}) {
  const manifest = assertEnrollmentManifest({ manifest: enrollmentManifest, now: issuedAt });

  if (revocationAuthorized !== true) {
    fail("revocation_not_authorized", "revocationAuthorized must be true");
  }
  if (hardDeleteAuthorized !== false) {
    fail("hard_delete_authorization_forbidden", "this gate cannot authorize hard deletion");
  }
  if (templateDeletionAuthorized !== false) {
    fail("template_deletion_authorization_forbidden", "this gate cannot authorize template deletion");
  }

  const issued = iso(issuedAt, "issuedAt");
  const expires = iso(expiresAt, "expiresAt");
  if (expires.ms <= issued.ms) {
    fail("invalid_revocation_authorization_window", "expiresAt must be after issuedAt");
  }

  const normalizedConsentDigest = sha256Digest(consentLedgerDigest, "consentLedgerDigest");
  if (normalizedConsentDigest !== manifest.consentLedgerDigest) {
    fail("consent_ledger_digest_mismatch", "authorization consentLedgerDigest does not match enrollment manifest");
  }

  const authorizationBody = body({
    authorizationId: required(authorizationId, "authorizationId"),
    enrollmentId: manifest.enrollmentId,
    enrollmentManifestDigest: manifest.manifestDigest,
    consentLedgerDigest: manifest.consentLedgerDigest,
    originalEnrollmentAuthorizationDigest: manifest.authorizationDigest,
    reasonCode: reason(reasonCode),
    issuedAt: issued.iso,
    expiresAt: expires.iso,
  });

  return Object.freeze({
    ...authorizationBody,
    authorizationDigest: digestObject(authorizationBody),
  });
}

export function assertEnrollmentRevocationAuthorization({
  authorization,
  enrollmentManifest,
  reasonCode,
  now,
} = {}) {
  if (!authorization || typeof authorization !== "object" || Array.isArray(authorization)) {
    fail("revocation_authorization_required", "authorization object is required");
  }

  const manifest = assertEnrollmentManifest({ manifest: enrollmentManifest, now });
  if (authorization.version !== TRUST_FACE_ENROLLMENT_REVOCATION_AUTHORIZATION_V1.version) {
    fail("revocation_authorization_version_mismatch", "authorization version mismatch");
  }
  if (authorization.scope !== TRUST_FACE_ENROLLMENT_REVOCATION_AUTHORIZATION_V1.scope) {
    fail("revocation_authorization_scope_mismatch", "authorization scope mismatch");
  }
  if (authorization.revocationAuthorized !== true) {
    fail("revocation_not_authorized", "revocation authorization is not active");
  }

  const forbidden = [
    ["hardDeleteAuthorized", false, "hard_delete_authorization_forbidden"],
    ["templateDeletionAuthorized", false, "template_deletion_authorization_forbidden"],
    ["authorizationObjectRequired", true, "revocation_authorization_policy_mismatch"],
    ["enrollmentManifestBindingRequired", true, "revocation_authorization_policy_mismatch"],
    ["consentLedgerBindingRequired", true, "revocation_authorization_policy_mismatch"],
    ["originalEnrollmentAuthorizationBindingRequired", true, "revocation_authorization_policy_mismatch"],
    ["rawBiometricPayloadAccepted", false, "revocation_authorization_policy_mismatch"],
    ["rawEmbeddingAccepted", false, "revocation_authorization_policy_mismatch"],
    ["realEnrollmentReady", false, "revocation_authorization_policy_mismatch"],
    ["productionReady", false, "revocation_authorization_policy_mismatch"],
    ["biometricClaimReady", false, "revocation_authorization_policy_mismatch"],
  ];
  for (const [field, expected, code] of forbidden) {
    if (authorization[field] !== expected) fail(code, `authorization ${field} mismatch`);
  }

  const expectedReason = reason(reasonCode);
  if (authorization.reasonCode !== expectedReason) {
    fail("revocation_authorization_reason_mismatch", "authorization reasonCode mismatch");
  }
  if (required(authorization.enrollmentId, "authorization.enrollmentId") !== manifest.enrollmentId) {
    fail("revocation_authorization_enrollment_mismatch", "authorization enrollmentId mismatch");
  }
  if (sha256Digest(authorization.enrollmentManifestDigest, "authorization.enrollmentManifestDigest") !== manifest.manifestDigest) {
    fail("revocation_authorization_manifest_digest_mismatch", "authorization manifest digest mismatch");
  }
  if (sha256Digest(authorization.consentLedgerDigest, "authorization.consentLedgerDigest") !== manifest.consentLedgerDigest) {
    fail("revocation_authorization_consent_digest_mismatch", "authorization consent digest mismatch");
  }
  if (sha256Digest(authorization.originalEnrollmentAuthorizationDigest, "authorization.originalEnrollmentAuthorizationDigest") !== manifest.authorizationDigest) {
    fail("revocation_authorization_original_enrollment_auth_mismatch", "authorization original enrollment authorization mismatch");
  }

  const current = iso(now, "now");
  const issued = iso(authorization.issuedAt, "authorization.issuedAt");
  const expires = iso(authorization.expiresAt, "authorization.expiresAt");
  if (current.ms < issued.ms || current.ms >= expires.ms) {
    fail("revocation_authorization_not_active", "authorization is outside its validity window");
  }

  const expectedBody = body({
    authorizationId: required(authorization.authorizationId, "authorization.authorizationId"),
    enrollmentId: manifest.enrollmentId,
    enrollmentManifestDigest: manifest.manifestDigest,
    consentLedgerDigest: manifest.consentLedgerDigest,
    originalEnrollmentAuthorizationDigest: manifest.authorizationDigest,
    reasonCode: expectedReason,
    issuedAt: issued.iso,
    expiresAt: expires.iso,
  });
  const expectedDigest = digestObject(expectedBody);
  if (authorization.authorizationDigest !== expectedDigest) {
    fail("revocation_authorization_digest_mismatch", "authorization digest mismatch");
  }

  return Object.freeze({
    authorized: true,
    authorizationId: expectedBody.authorizationId,
    authorizationDigest: expectedDigest,
    enrollmentId: manifest.enrollmentId,
    enrollmentManifestDigest: manifest.manifestDigest,
    consentLedgerDigest: manifest.consentLedgerDigest,
    originalEnrollmentAuthorizationDigest: manifest.authorizationDigest,
    reasonCode: expectedReason,
    hardDeleteAuthorized: false,
    templateDeletionAuthorized: false,
    realEnrollmentReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function createAuthorizedEnrollmentRevocationPersistence({
  enrollmentRepository,
  revocationRepository,
} = {}) {
  if (!enrollmentRepository || typeof enrollmentRepository.getById !== "function") {
    fail("invalid_enrollment_repository", "enrollmentRepository must provide getById");
  }

  const lifecycle = createEnrollmentRevocationPersistence({
    enrollmentRepository,
    revocationRepository,
  });

  return Object.freeze({
    version: "trust-face-authorized-enrollment-revocation-persistence/v1",
    authorizationObjectRequired: true,
    digestOnlyRevocationAccepted: false,
    hardDeleteAllowed: false,
    templateDeletionPerformed: false,
    realEnrollmentReady: false,
    productionReady: false,
    biometricClaimReady: false,

    async revokeEnrollment({
      enrolmentId,
      authorization,
      reasonCode,
      revokedAt,
    } = {}) {
      const normalizedId = required(enrollmentId, "enrollmentId");
      const manifest = await enrollmentRepository.getById(normalizedId);
      if (manifest === null) {
        fail("enrollment_not_found", "enrollment was not found");
      }

      const checked = assertEnrollmentRevocationAuthorization({
        authorization,
        enrollmentManifest: manifest,
        reasonCode,
        now: revokedAt,
      });

      return lifecycle.revokeEnrollment({
        enrollmentId: normalizedId,
        revocationAuthorizationDigest: checked.authorizationDigest,
        reasonCode: checked.reasonCode,
        revokedAt,
      });
    },

    async getEnrollmentLifecycle(enrollmentId, options = {}) {
      return lifecycle.getEnrollmentLifecycle(enrollmentId, options);
    },

    async listRevocations(options = {}) {
      return lifecycle.listRevocations(options);
    },
  });
}
