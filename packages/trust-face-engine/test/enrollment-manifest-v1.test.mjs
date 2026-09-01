import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_ENROLLMENT_MANIFEST_V1 as PROFILE,
  TrustFaceEnrollmentManifestV1Error,
  createEnrollmentManifest,
  assertEnrollmentManifest,
  createEnrollmentPersistence,
} from "../src/enrollment-manifest-v1.mjs";

const d = (char) => `${char.repeat(64)}`;

function input(overrides = {}) {
  return {
    enrollmentId: "enrollment-001",
    subjectRef: "subject-ref-001",
    templateRef: "vault://trust-face/templates/template-001",
    templateDigest: d("a"),
    modelVersion: "trust-face-owned-embedding/v1",
    consentLedgerDigest: d("b"),
    authorizationDigest: d("c"),
    enrolledAt: "2026-08-31T23:00:00Z",
    ...overrides,
  };
}

function memoryRepository() {
  const records = new Map();
  return {
    async create(record) {
      if (records.has(record.enrollmentId)) {
        const error = new Error("record already exists");
        error.code = "record_conflict";
        throw error;
      }
      const copy = structuredClone(record);
      records.set(record.enrollmentId, copy);
      return structuredClone(copy);
    },
    async getById(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async list({ where = {} } = {}) {
      return [...records.values()]
      .filter((record) =>
          Object.entries(where).every(([key, value]) => record[key] === value),
      )
      .sort((a, b) => a.enrollmentId.localeCompare(b.enrollmentId))
      .map((record) => structuredClone(record));
    },
    unsafeMutate(id, mutate) {
      mutate(records.get(id));
    },
  };
}

test("profile remains metadata-only and non-production", () => {
  assert.equal(PROFILE.metadataOnly, true);
  assert.equal(PROFILE.templatePayloadPersisted, false);
  assert.equal(PROFILE.rawBiometricsRetained, false);
  assert.equal(PROFILE.rawEmbeddingsRetained, false);
  assert.equal(PROFILE.consentRequired, true);
  assert.equal(PROFILE.authorizationRequired, true);
  assert.equal(PROFILE.immutableRecord, true);
  assert.equal(PROFILE.realEnrollmentReady, false);
  assert.equal(PROFILE.productionReady, false);
  assert.equal(PROFILE.biometricClaimReady, false);
});

test("manifest is deterministic and digest-bound", () => {
  const a = createEnrollmentManifest(input());
  const b = createEnrollmentManifest(input());
  assert.deepEqual(a, b);
  assert.match(a.manifestDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a.state, "active");
});

test("raw biometric, embedding and template payloads are rejected", () => {
  for (const field of ["image", "video", "embedding", "vector", "template", "templatePayload"]) {
    assert.throws(
      () => createEnrollmentManifest({ ...input(), [field]: [1, 2, 3] }),
      (error) =>
        error instanceof TrustFaceEnrollmentManifestV1Error &&
        error.code === "raw_enrollment_payload_forbidden",
     );
  }
});

test("assertion validates canonical manifest and future time", () => {
  const manifest = createEnrollmentManifest(input());
  const checked = assertEnrollmentManifest({
    manifest,
    now: "2026-08-31T23:10:00Z",
  });
  assert.equal(checked.valid, true);
  assert.equal(checked.realEnrollmentReady, false);

  assert.throws(
    () =>
      assertEnrollmentManifest({
        manifest,
        now: "2026-08-31T22:59:59Z",
      }),
    (error) => error?.code === "enrollment_manifest_from_future",
  );
});

test("assertion rejects policy and digest tampering", () => {
  const manifest = createEnrollmentManifest(input());
  assert.throws(
    () =>
      assertEnrollmentManifest({
        manifest: { ...manifest, productionReady: true },
        now: "2026-08-31T23:10:00Z",
      }),
    (error) => error?.code === "enrollment_manifest_policy_mismatch",
  );
  assert.throws(
    () =>
      assertEnrollmentManifest({
        manifest: { ...manifest, manifestDigest: d("9") },
        now: "2026-08-31T23:10:00Z",
      }),
    (error) => error?.code === "enrollment_manifest_digest_mismatch",
  );
});

test("persistence facade creates, reads and filters manifests", async () => {
  const repository = memoryRepository();
  const persistence = createEnrollmentPersistence({ repository });

  const first = await persistence.enroll(input());
  const second = await persistence.enroll(
    input({
      enrollmentId: "enrollment-002",
      subjectRef: "subject-ref-002",
      templateRef: "vault://trust-face/templates/template-002",
      templateDigest: d("d"),
    }),
  );

  const loaded = await persistence.getEnrollment("enrollment-001", {
    now: "2026-08-31T23:10:00Z",
  });
  assert.deepEqual(loaded, first);

  const onlySecond = await persistence.listEnrollments({
    subjectRef: "subject-ref-002",
    now: "2026-08-31T23:10:00Z",
  });
  assert.deepEqual(onlySecond, [second]);

  const all = await persistence.listEnrollments({
    now: "2026-08-31T23:10:00Z",
  });
  assert.equal(all.length, 2);
  assert.equal(persistence.metadataOnly, true);
  assert.equal(persistence.productionReady, false);
});

test("duplicate enrollment id fails closed through repository conflict", async () => {
  const persistence = createEnrollmentPersistence({ repository: memoryRepository() });
  await persistence.enroll(input());
  await assert.rejects(
    () => persistence.enroll(input()),
    (error) => error?.code === "record_conflict",
  );
});

test("tampered persisted record is rejected on read", async () => {
  const repository = memoryRepository();
  const persistence = createEnrollmentPersistence({ repository });
  await persistence.enroll(input());
  repository.unsafeMutate("enrollment-001", (record) => {
    record.templateDigest = d("9");
  });

  await assert.rejects(
    () =>
      persistence.getEnrollment("enrollment-001", {
        now: "2026-08-31T23:10:00Z",
      }),
    (error) =>
      [
        "enrollment_manifest_templateDigest_mismatch",
        "enrollment_manifest_digest_mismatch",
      ].includes(error?.code),
   );
});

test("persistence facade exposes no mutation or deletion lifecycle in v1", () => {
  const persistence = createEnrollmentPersistence({ repository: memoryRepository() });
  assert.equal("replace" in persistence, false);
  assert.equal("delete" in persistence, false);
  assert.equal("revoke" in persistence, false);
});
