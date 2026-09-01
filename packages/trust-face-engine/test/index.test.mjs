import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_ENGINE_PROFILE,
  TrustFaceEngineError,
  cosineSimilarity,
  createFaceEmbedding,
  createThresholdProfile,
  evaluateCaptureQuality,
  verifyFacePair,
} from "../src/index.mjs";
import { createLivenessPadLabEvidence } from "../src/liveness-pad-lab-v1.mjs";

const PAD_SIGNALS = Object.freeze({
  temporalMotionConsistency: 0.82,
  depthConsistency: 0.79,
  textureNaturalness: 0.84,
  replayArtifactResistance: 0.9,
});

function verificationFixture() {
  const reference = createFaceEmbedding({ values: [1, 0, 0] });
  const probe = createFaceEmbedding({ values: [0.9, 0.1, 0] });
  const thresholdProfile = createThresholdProfile({
    id: "trust-face-1to1/test-v1",
    cosineSimilarity: 0.95,
  });
  return { reference, probe, thresholdProfile };
}

test("lab profile does not claim production or real liveness", () => {
  assert.equal(TRUST_FACE_ENGINE_PROFILE.productionReady, false);
  assert.equal(TRUST_FACE_ENGINE_PROFILE.verification1to1, true);
  assert.equal(TRUST_FACE_ENGINE_PROFILE.livenessPad, false);
  assert.equal(TRUST_FACE_ENGINE_PROFILE.livenessPadLab, true);
});

test("quality gate accepts one clear face and rejects multiple faces", () => {
  const passed = evaluateCaptureQuality({
    faceDetected: true, faceCount: 1, sharpness: 0.9,
    illumination: 0.8, frontalness: 0.95, occlusion: 0.05,
  });
  assert.equal(passed.passed, true);

  const rejected = evaluateCaptureQuality({
    faceDetected: true, faceCount: 2, sharpness: 1,
    illumination: 1, frontalness : 1, occlusion: 0,
  });
  assert.equal(rejected.passed, false);
  assert.throws(
    () => createFaceEmbedding({ values: [1, 0, 0], quality: rejected }),
    (error) => error instanceof TrustFaceEngineError &&
      error.code === "capture_quality_rejected",
  );
});

test("embedding normalization and cosine similarity are deterministic", () => {
  const a = createFaceEmbedding({ values: [1, 2, 3] });
  const same = createFaceEmbedding({ values: [2, 4, 6] });
  const orthogonal = createFaceEmbedding({ values: [2, -1, 0] });
  assert.ok(Math.abs(cosineSimilarity(a, same) - 1) < 1e-12);
  assert.ok(Math.abs(cosineSimilarity(a, orthogonal)) < 1e-12);
});

test("1:1 verification remains a biometric signal without real liveness claims", () => {
  const { reference, probe, thresholdProfile } = verificationFixture();
  const result = verifyFacePair({
    referenceEmbedding: reference,
    probeEmbedding: probe,
    thresholdProfile,
  });

  assert.equal(result.matched, true);
  assert.equal(result.decisionCreated, false);
  assert.equal(result.livenessEvaluated, false);
  assert.equal(result.livenessEvaluatedInLab, false);
  assert.equal(result.livenessLabSignalPassed, null);
  assert.equal(result.labVerificationPassed, null);
  assert.equal(result.livenessEvidenceId, null);
  assert.equal(result.livenessEvidenceDigest, null);
  assert.equal(result.livenessDecisionCreated, false);
  assert.equal(result.realPadReady, false);
  assert.equal(result.productionReady, false);
  assert.equal(result.biometricClaimReady, false);
});

test("verifyFacePair binds valid PAD lab evidence without creating a real liveness decision", () => {
  const { reference, probe, thresholdProfile } = verificationFixture();
  const evidence = createLivenessPadLabEvidence({
    evidenceId: "pad-kernel-001",
    signals: PAD_SIGNALS,
    createdAt: "2026-08-31T23:00:00Z",
  });

  const result = verifyFacePair({
    referenceEmbedding: reference,
    probeEmbedding: probe,
    thresholdProfile,
    livenessPadLab: {
      evidence,
      signals: PAD_SIGNALS,
      now: "2026-08-31T23:10:00Z",
    },
  });

  assert.equal(result.matched, true);
  assert.equal(result.decisionCreated, false);
  assert.equal(result.livenessEvaluated, false);
  assert.equal(result.livenessEvaluatedInLab, true);
  assert.equal(result.livenessLabSignalPassed, true);
  assert.equal(result.labVerificationPassed, true);
  assert.equal(result.livenessEvidenceId, evidence.evidenceId);
  assert.equal(result.livenessEvidenceDigest, evidence.evidenceDigest);
  assert.equal(result.livenessDecisionCreated, false);
  assert.equal(result.realPadReady, false);
  assert.equal(result.productionReady, false);
  assert.equal(result.biometricClaimReady, false);
});

test("failed PAD lab signal blocks only the combined lab verification signal", () => {
  const { reference, probe, thresholdProfile } = verificationFixture();
  const weakSignals = Object.freeze({ ...PAD_SIGNALS,
    depthConsistency: 0.2,
  });
  const evidence = createLivenessPadLabEvidence({
    evidenceId: "pad-kernel-002",
    signals: weakSignals,
    createdAt: "2026-08-31T23:00:00Z",
  });

  const result = verifyFacePair({
    referenceEmbedding: reference,
    probeEmbedding: probe,
    thresholdProfile,
    livenessPadLab: {
      evidence,
      signals: weakSignals,
      now: "2026-08-31T23:10:00Z",
    },
  });

  assert.equal(result.matched, true);
  assert.equal(result.livenessEvaluated, false);
  assert.equal(result.livenessEvaluatedInLab, true);
  assert.equal(result.livenessLabSignalPassed, false);
  assert.equal(result.labVerificationPassed, false);
  assert.equal(result.realPadReady, false);
});

test("tampered PAD lab evidence is rejected before the kernel returns a verification signal", () => {
  const { reference, probe, thresholdProfile } = verificationFixture();
  const evidence = createLivenessPadLabEvidence({
    evidenceId: "pad-kernel-003",
    signals: PAD_SIGNALS,
    createdAt: "2026-08-31T23:00:00Z",
  });

  assert.throws(
    () => verifyFacePair({
      referenceEmbedding: reference,
      probeEmbedding: probe,
      thresholdProfile,
      livenessPadLab: {
        evidence: { ...evidence, productionReady: true },
        signals: PAD_SIGNALS,
        now: "2026-08-31T23:10:00Z",
      },
    }),
    (error) => error?.code === "pad_evidence_policy_mismatch",
   );
});
