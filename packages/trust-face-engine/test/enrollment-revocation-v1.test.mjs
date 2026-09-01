import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_ENROLLMENT_REVOCATION_V1 as PROFILE,
  TrustFaceEnrollmentRevocationV1Error,
  createEnrollmentRevocation,
  assertEnrollmentRevocation,
  createEnrollmentRevocationPersistence,
} from "../src/enrollment-revocation-v1.mjs";
import { createEnrollmentManifest } from "../src/enrollment-manifest-v1.mjs";

const d = (char) => `sha256:${char.repeat(64)}`;

function manifest(overrides = {}) {
  return createEnrollmentManifest({
    enrollmentId: "enrollment-001",
    subjectRef: "subject-ref-001",
    templateRef: "vault://trust-face/templates/template-001",
    templateDigest: d("1"),
    modelVersion: "trust-face-owned-embedding/v1",
    consentLedgerDigest: d("2"),
    authorizationDigest: d("3"),
    enrolledAt: "2026-08-31T23:00:00Z",
    ...overrides,
  });
}

function revocationInput(overrides = {}) {
  const enrollmentManifest = manifest();
  return {
    enrollmentId: enrollmentManifest.enrollmentId,
    enrollmentManifestDigest: enrollmentManifest.manifestDigest,
    revocationAuthorizationDigest: d("b"),
    reasonCode: "subject-request",
    revokedAt: "2026-08-31T23:10:00Z",
    ...overrides,
  };
}

function memoryRepository({ idField = "enrollmentId", initial = [] } = {}) {
  const records = new Map(initial.map((record) => [record[idField], structuredClone(record)]));
  return {
    async create(record) {
      const id = record[idField];
      if (records.has(id)) {
        const error = new Error("record conflict");
        error.code = "record_conflict";
        throw error;
      }
      const copy = structuredClone(record);
      records.set(id, copy);
      return structuredClone(copy);
    },
    async getById(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async list({ where = {} } = {}) {
      return [...records.values()]
        .filter((record) => Object.entries(where).every(([key, value]) => record[key] === value))
        .map((record) => structuredClone(record));
    },
    unsafeMutate(id, mutate) {
      mutate(records.get(id));
    },
  };
}

test("profile is append-only and non-production", () => {
  assert.equal(PROFILE.appendOnly, true);
  assert.equal(PROFILE.hardDeleteAllowed, false);
  assert.equal(PROFILE.enrollmentMutationAllowed, false);
  assert.equal(PROFILE.templateDeletionPerformed, false);
  assert.equal(PROFILE.templatePayloadPersisted, false);
  assert.equal(PROFILE.rawBiometricsRetained, false);
  assert.equal(PROFILE.rawEmbeddingsRetained, false);
  assert.equal(PROFILE.realEnrollmentReady, false);
  assert.equal(PROFILE.productionReady, false);
  assert.equal(PROFILE.biometricClaimReady, false);
});

test("revocation is deterministic and digest-bound", () => {
  const a = createEnrollmentRevocation(revocationInput());
  const b = createEnrollmentRevocation(revocationInput());
  assert.deepEqual(a, b);
  assert.match(a.revocationDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a.previousState, "active");
  assert.equal(a.nextState, "revoked");
});

test("raw payload and unsupported reason are rejected", () => {
  assert.throws(
    () => createEnrollmentRevocation({ ...revocationInput(), embedding: [1, 2, 3] }),
    (error) => error instanceof TrustFaceEnrollmentRevocationV1Error &&
      error.code === "raw_enrollment_revocation_payload_forbidden",
  );
  assert.throws(
    () => createEnrollmentRevocation({ ...revocationInput(), reasonCode: "silent-delete" }),
    (error) => error?.code === "invalid_enrollment_revocation_reason",
  );
});

test("assertion binds revocation to exact manifest and timeline", () => {
  const enrollmentManifest = manifest();
  const revocation = createEnrollmentRevocation(revocationInput());
  const checked = assertEnrollmentRevocation({
    revocation,
    enrollmentManifest,
    now: "2026-08-31T23:20:00Z",
  });
  assert.equal(checked.valid, true);
  assert.equal(checked.state, "revoked");
  assert.equal(checked.enrollmentManifestDigest, enrollmentManifest.manifestDigest);

  assert.throws(
    () => assertEnrollmentRevocation({
      revocation: createEnrollmentRevocation(revocationInput({ revokedAt: "2026-08-31T22:59:59Z" })),
      enrollmentManifest,
      now: "2026-08-31T23:20:00Z",
    }),
    (error) => error?.code === "enrollment_revocation_before_enrollment",
   );
});

test("assertion rejects manifest mismatch and tampering", () => {
  const enrollmentManifest = manifest();
  const revocation = createEnrollmentRevocation(revocationInput());
  assert.throws(
    () => assertEnrollmentRevocation({
      revocation,
      enrollmentManifest: manifest({ enrollmentId: "enrollment-002" }),
      now: "2026-08-31T23:20:00Z",
    }),
    (error) => error?.code === "enrollment_revocation_enrollment_mismatch",
  );
  assert.throws(
    () => assertEnrollmentRevocation({
      revocation: { ...revocation, productionReady: true },
      enrollmentManifest,
      now: "2026-08-31T23:20:00Z",
    }),
    (error) => error?.code === "enrollment_revocation_policy_mismatch",
  );
  assert.throws(
    () => assertEnrollmentRevocation({
      revocation: { ...revocation, revocationDigest: d("9") },
      enrollmentManifest,
      now: "2026-08-31T23:20:00Z",
    }),
    (error) => error?.code === "enrollment_revocation_digest_mismatch",
   );
});

test("persistence derives active then revoked lifecycle without deleting enrollment", async () => {
  const enrollmentRepository = memoryRepository({ initial: [manifest()] });
  const revocationRepository = memoryRepository();
  const lifecycle = createEnrollmentRevocationPersistence({ enrollmentRepository, revocationRepository });

  const active = await lifecycle.getEnrollmentLifecycle("enrollment-001", {
    now: "2026-08-31T23:05:00Z",
  });
  assert.equal(active.state, "active");
  assert.equal(active.hardDeleted, false);

  const revoked = await lifecycle.revokeEnrollment({
    enrollmentId: "enrollment-001",
    revocationAuthorizationDigest: d("b"),
    reasonCode: "subject-request",
    revokedAt: "2026-08-31T23:10:00Z",
  });
  assert.equal(revoked.nextState, "revoked");

  const state = await lifecycle.getEnrollmentLifecycle("enrollment-001", {
    now: "2026-08-31T23:20:00Z",
  });
  assert.equal(state.state, "revoked");
  assert.equal(state.hardDeleted, false);
  assert.equal((await enrollmentRepository.getById("enrollment-001")).state, "active");
});

test("duplicate revocation fails closed", async () => {
  const enrollmentRepository = memoryRepository({ initial: [manifest()] });
  const revocationRepository = memoryRepository();
  const lifecycle = createEnrollmentRevocationPersistence({ enrollmentRepository, revocationRepository });
  const input = {
    enrollmentId: "enrollment-001",
    revocationAuthorizationDigest: d("b"),
    reasonCode: "subject-request",
    revokedAt: "2026-08-31T23:10:00Z",
  };
  await lifecycle.revokeEnrollment(input);
  await assert.rejects(
    () => lifecycle.revokeEnrollment(input),
    (error) => error?.code === "enrollment_already_revoked",
  );
});

test("concurrent repository conflict is normalized to already revoked", async () => {
  const enrollmentRepository = memoryRepository({ initial: [manifest()] });
  let concurrent = null;
  const revocationRepository = {
    async getById() {
      return concurrent === null ? null : structuredClone(concurrent);
    },
    async create(record) {
      concurrent = structuredClone(record);
      const error = new Error("record conflict");
      error.code = "record_conflict";
      throw error;
    },
    async list() {
      return concurrent === null ? [] : [structuredClone(concurrent)];
    },
  };
  const lifecycle = createEnrollmentRevocationPersistence({
    enrollmentRepository,
    revocationRepository,
  });

  await assert.rejects(
    () => lifecycle.revokeEnrollment({
      enrollmentId: "enrollment-001",
      revocationAuthorizationDigest: d("b"),
      reasonCode: "subject-request",
      revokedAt: "2026-08-31T23:10:00Z",
    }),
    (error) => error?.code === "enrollment_already_revoked",
  );
});

test("tampered persisted revocation is rejected on lifecycle read", async () => {
  const enrollmentRepository = memoryRepository({ initial: [manifest()] });
  const revocationRepository = memoryRepository();
  const lifecycle = createEnrollmentRevocationPersistence({ enrollmentRepository, revocationRepository });
  await lifecycle.revokeEnrollment({
    enrollmentId: "enrollment-001",
    revocationAuthorizationDigest: d("b"),
    reasonCode: "subject-request",
    revokedAt: "2026-08-31T23:10:00Z",
  });
  revocationRepository.unsafeMutate("enrollment-001", (record) => {
    record.revocationAuthorizationDigest = d("9");
  });
  await assert.rejects(
    () => lifecycle.getEnrollmentLifecycle("enrollment-001", { now: "2026-08-31T23:20:00Z" }),
    (error) => [
      "enrollment_revocation_revocationAuthorizationDigest_mismatch",
      "enrollment_revocation_digest_mismatch",
    ].includes(error?.code),
   );
});

test("missing enrollment cannot be revoked and orphan revocations fail closed", async () => {
  const enrollmentRepository = memoryRepository();
  const revocationRepository = memoryRepository();
  const lifecycle = createEnrollmentRevocationPersistence({ enrollmentRepository, revocationRepository });
  await assert.rejects(
    () => lifecycle.revokeEnrollment({
      enrollmentId: "missing",
      revocationAuthorizationDigest: d("b"),
      reasonCode: "subject-request",
      revokedAt: "2026-08-31T23:10:00Z",
    }),
    (error) => error?.code === "enrollment_not_found",
  );

  const missingManifest = manifest({ enrollmentId: "missing" });
  await revocationRepository.create(createEnrollmentRevocation({
    enrollmentId: "missing",
    enrollmentManifestDigest: missingManifest.manifestDigest,
    revocationAuthorizationDigest: d("b"),
    reasonCode: "subject-request",
    revokedAt: "2026-08-31T23:10:00Z",
  }));
  await assert.rejects(
    () => lifecycle.listRevocations({ now: "2026-08-31T23:20:00Z" }),
    (error) => error?.code === "orphan_enrollment_revocation",
  );
});

test("facade exposes no hard delete or enrollment mutation path", () => {
  const lifecycle = createEnrollmentRevocationPersistence({
    enrollmentRepository: memoryRepository({ initial: [manifest()] }),
    revocationRepository: memoryRepository(),
  });
  assert.equal("delete" in lifecycle, false);
  assert.equal("replace" in lifecycle, false);
  assert.equal("deleteEnrollment" in lifecycle, false);
  assert.equal("replaceEnrollment" in lifecycle, false);
});
