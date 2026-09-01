import assert from "node:assert/strict";
import test from "node:test";
import {
  TRUST_FACE_ENROLLMENT_REVOCATION_AUTHORIZATION_V1 as PROFILE,
  createEnrollmentRevocationAuthorization,
  assertEnrollmentRevocationAuthorization,
  createAuthorizedEnrollmentRevocationPersistence,
} from "../src/enrollment-revocation-authorization-v1.mjs";
import { createEnrollmentManifest } from "../src/enrollment-manifest-v1.mjs";

const d = (c) => `sha256:${c.repeat(64)}`;
const manifest = createEnrollmentManifest({
  enrollmentId: "enrollment-001",
  subjectRef: "subject-ref-001",
  templateRef: "vault://trust-face/templates/template-001",
  templateDigest: d("1"),
  modelVersion: "trust-face-owned-embedding/v1",
  consentLedgerDigest: d("2"),
  authorizationDigest: d("3"),
  enrolledAt: "2026-08-31T22:00:00Z",
});
const auth = (overrides = {}) => createEnrollmentRevocationAuthorization({
  authorizationId: "rev-auth-001",
  enrollmentManifest: manifest,
  consentLedgerDigest: manifest.consentLedgerDigest,
  reasonCode: "subject-request",
  issuedAt: "2026-08-31T23:00:00Z",
  expiresAt: "2026-09-01T00:00:00Z",
  ...overrides,
});
function repo(initial = []) {
  const map = new Map(initial.map((r) => [r.enrollmentId, structuredClone(r)]));
  return {
    async getById(id) { return map.has(id) ? structuredClone(map.get(id)) : null; },
    async create(record) {
      if (map.has(record.enrollmentId)) { const error = new Error("conflict"); error.code = "record_conflict"; throw error; }
      map.set(record.enrollmentId, structuredClone(record));
      return structuredClone(record);
    },
    async list() { return [...map.values()].map((value) => structuredClone(value)); },
  };
}

test("profile is fail-closed and non-production", () => {
  assert.equal(PROFILE.authorizationObjectRequired, true);
  assert.equal(PROFILE.enrollmentManifestBindingRequired, true);
  assert.equal(PROFILE.consentLedgerBindingRequired, true);
  assert.equal(PROFILE.hardDeleteAuthorizedByThisGate, false);
  assert.equal(PROFILE.templateDeletionAuthorizedByThisGate, false);
  assert.equal(PROFILE.productionReady, false);
});
test("authorization is deterministic and bound to enrollment and consent", () => {
  const a = auth();
  assert.deepEqual(a, auth());
  assert.equal(a.enrollmentId, manifest.enrollmentId);
  assert.equal(a.enrollmentManifestDigest, manifest.manifestDigest);
  assert.equal(a.consentLedgerDigest, manifest.consentLedgerDigest);
  assert.equal(a.originalEnrollmentAuthorizationDigest, manifest.authorizationDigest);
  assert.match(a.authorizationDigest, /^sha256:[0-9a-f]{64}$/);
});
test("creation rejects consent mismatch and dangerous flags", () => {
  assert.throws(() => auth({ consentLedgerDigest: d("9") }), (e) => e?.code === "consent_ledger_digest_mismatch");
  assert.throws(() => auth({ hardDeleteAuthorized: true }), (e) => e?.code === "hard_delete_authorization_forbidden");
  assert.throws(() => auth({ templateDeletionAuthorized: true }), (e) => e?.code === "template_deletion_authorization_forbidden");
});
test("assertion enforces reason and active time window", () => {
  const a = auth();
  const ok = assertEnrollmentRevocationAuthorization({ authorization: a, enrollmentManifest: manifest, reasonCode: "subject-request", now: "2026-08-31T23:30:00Z" });
  assert.equal(ok.authorizationDigest, a.authorizationDigest);
  assert.throws(() => assertEnrollmentRevocationAuthorization({ authorization: a, enrollmentManifest: manifest, reasonCode: "security-response", now: "2026-08-31T23:30:00Z" }), (e) => e?.code === "revocation_authorization_reason_mismatch");
  assert.throws(() => assertEnrollmentRevocationAuthorization({ authorization: a, enrollmentManifest: manifest, reasonCode: "subject-request", now: "2026-09-01T00:00:00Z" }), (e) => e?.code === "revocation_authorization_not_active");
});
test("assertion rejects binding tampering", () => {
  const a = auth();
  assert.throws(() => assertEnrollmentRevocationAuthorization({ authorization: { ...a, consentLedgerDigest: d("5") }, enrollmentManifest: manifest, reasonCode: "subject-request", now: "2026-08-31T23:30:00Z" }), (e) => e?.code === "revocation_authorization_consent_digest_mismatch");
  assert.throws(() => assertEnrollmentRevocationAuthorization({ authorization: { ...a, originalEnrollmentAuthorizationDigest: d("6") }, enrollmentManifest: manifest, reasonCode: "subject-request", now: "2026-08-31T23:30:00Z" }), (e) => e?.code === "revocation_authorization_original_enrollment_auth_mismatch");
});
test("digest tampering is rejected", () => {
  const a = auth();
  assert.throws(() => assertEnrollmentRevocationAuthorization({ authorization: { ...a, authorizationDigest: d("9") }, enrollmentManifest: manifest, reasonCode: "subject-request", now: "2026-08-31T23:30:00Z" }), (e) => e?.code === "revocation_authorization_digest_mismatch");
});
test("governed facade requires full authorization before revocation", async () => {
  const enrollmentRepository = repo([manifest]);
  const governed = createAuthorizedEnrollmentRevocationPersistence({ enrollmentRepository, revocationRepository: repo() });
  assert.equal(governed.authorizationObjectRequired, true);
  assert.equal(governed.digestOnlyRevocationAccepted, false);
  const a = auth();
  const revoked = await governed.revokeEnrollment({ enrollmentId: manifest.enrollmentId, authorization: a, reasonCode: "subject-request", revokedAt: "2026-08-31T23:30:00Z" });
  assert.equal(revoked.revocationAuthorizationDigest, a.authorizationDigest);
  assert.equal(revoked.nextState, "revoked");
});
test("governed facade rejects missing or wrong authorization", async () => {
  const enrollmentRepository = repo([manifest]);
  const governed = createAuthorizedEnrollmentRevocationPersistence({ enrollmentRepository, revocationRepository: repo() });
  await assert.rejects(() => governed.revokeEnrollment({ enrollmentId: manifest.enrollmentId, reasonCode: "subject-request", revokedAt: "2026-08-31T23:30:00Z" }), (e) => e?.code === "revocation_authorization_required");
  await assert.rejects(() => governed.revokeEnrollment({ enrollmentId: manifest.enrollmentId, authorization: auth(), reasonCode: "security-response", revokedAt: "2026-08-31T23:30:00Z" }), (e) => e?.code === "revocation_authorization_reason_mismatch");
});
