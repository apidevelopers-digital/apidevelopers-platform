
import assert from "node:assert/strict";
import test from "node:test";

import {
  createConsentedLabManifest,
  createConsentedLabPlan,
  TRUST_FACE_CONSENTED_LAB_PROFILE,
} from "../src/consented-lab.mjs";

function participants() {
  return [
    {
      subjectId: "subject-a",
      consentRef: "consent://lab/a",
      consentCapturedAt: "2026-08-28T12:00:00Z",
      adultConfirmed: true,
      voluntaryConfirmed: true,
      purposeConfirmed: true,
      deletionRightConfirmed: true,
    },
    {
      subjectId: "subject-b",
      consentRef: "consent://lab/b",
      consentCapturedAt: "2026-08-28T12:05:00Z",
      adultConfirmed: true,
      voluntaryConfirmed: true,
      purposeConfirmed: true,
      deletionRightConfirmed: true,
    },
  ];
}

function plan() {
  return createConsentedLabPlan({
    labId: "trust-face-consented-lab-001",
    createdAt: "2026-08-28T12:10:00Z",
    retentionDays: 14,
    participants: participants(),
  });
}

test("consented lab profile forbids repository persistence and production claims", () => {
  assert.equal(TRUST_FACE_CONSENTED_LAB_PROFILE.productionReady, false);
  assert.equal(TRUST_FACE_CONSENTED_LAB_PROFILE.biometricClaimReady, false);
  assert.equal(TRUST_FACE_CONSENTED_LAB_PROFILE.rawBiometricPersistenceInRepo, false);
  assert.equal(TRUST_FACE_CONSENTED_LAB_PROFILE.rawBiometricLogging, false);
});

test("plan requires two complete voluntary adult consent records", () => {
  const created = plan();
  assert.equal(created.participants.length, 2);
  assert.equal(created.storagePolicy.rawImagesInGit, false);
  assert.equal(created.retentionDays, 14);

  assert.throws(
    () => createConsentedLabPlan({
      labId: "bad",
      createdAt: "2026-08-28T12:10:00Z",
      participants: [participants()[0]],
    }),
    (error) => error?.code === "insufficient_consented_participants",
  );
});

test("direct PII is rejected from consent metadata", () => {
  const bad = participants();
  bad[0] = { ...bad[0], name: "Example Person" };
  assert.throws(
    () => createConsentedLabPlan({
      labId: "pii",
      createdAt: "2026-08-28T12:10:00Z",
      participants: bad,
    }),
    (error) => error?.code === "direct_pii_forbidden",
  );
});

test("manifest accepts only samples linked to consented pseudonymous subjects", () => {
  const createdPlan = plan();
  const samples = [
    { sampleId: "a-1", subjectId: "subject-a", assetRef: "local://a/1", split: "test" },
    { sampleId: "a-2", subjectId: "subject-a", assetRef: "local://a/2", split: "test" },
    { sampleId: "b-1", subjectId: "subject-b", assetRef: "local://b/1", split: "test" },
    { sampleId: "b-2", subjectId: "subject-b", assetRef: "local://b/2", split: "test" },
  ];
  const manifest = createConsentedLabManifest({
    plan: createdPlan,
    datasetId: "consented-face-lab-v0",
    version: "0.1.0",
    samples,
  });

  assert.equal(manifest.authority.basis, "consented-lab");
  assert.ok(manifest.authority.evidenceRef.startsWith("consented-lab:"));
  assert.ok(manifest.digest.startsWith("sha256:"));
  assert.equal(manifest.productionReady, false);

  assert.throws(
    () => createConsentedLabManifest({
      plan: createdPlan,
      datasetId: "bad",
      version: "0.1.0",
      samples: [...samples.slice(0, 3), { sampleId: "x-1", subjectId: "unknown", assetRef: "local://x/1", split: "test" }],
    }),
    (error) => error?.code === "sample_without_consent",
  );
});

test("raw biometric fields remain forbidden by dataset manifest boundary", () => {
  const createdPlan = plan();
  assert.throws(
    () => createConsentedLabManifest({
      plan: createdPlan,
      datasetId: "bad-raw",
      version: "0.1.0",
      samples: [
        { sampleId: "a-1", subjectId: "subject-a", assetRef: "local://a/1", split: "test", pixels: [0, 1] },
        { sampleId: "a-2", subjectId: "subject-a", assetRef: "local://a/2", split: "test" },
        { sampleId: "b-1", subjectId: "subject-b", assetRef: "local://b/1", split: "test" },
        { sampleId: "b-2", subjectId: "subject-b", assetRef: "local://b/2", split: "test" },
      ],
    }),
    (error) => error?.code === "raw_biometric_payload_forbidden",
  );
});
