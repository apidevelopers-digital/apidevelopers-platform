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

test("lab profile does not claim production or liveness", () => {
  assert.equal(TRUST_FACE_ENGINE_PROFILE.productionReady, false);
  assert.equal(TRUST_FACE_ENGINE_PROFILE.verification1to1, true);
  assert.equal(TRUST_FACE_ENGINE_PROFILE.livenessPad, false);
});

test("quality gate accepts one clear face and rejects multiple faces", () => {
  const passed = evaluateCaptureQuality({
    faceDetected: true, faceCount: 1, sharpness: 0.9,
    illumination: 0.8, frontalness: 0.95, occlusion: 0.05,
  });
  assert.equal(passed.passed, true);

  const rejected = evaluateCaptureQuality({
    faceDetected: true, faceCount: 2, sharpness: 1,
    illumination: 1, frontalness: 1, occlusion: 0,
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

test("1:1 verification returns a biometric signal, not a governed decision", () => {
  const reference = createFaceEmbedding({ values: [1, 0, 0] });
  const probe = createFaceEmbedding({ values: [0.9, 0.1, 0] });
  const thresholdProfile = createThresholdProfile({
    id: "trust-face-1to1/test-v1",
    cosineSimilarity: 0.95,
  });
  const result = verifyFacePair({
    referenceEmbedding: reference,
    probeEmbedding: probe,
    thresholdProfile,
  });
  assert.equal(result.matched, true);
  assert.equal(result.decisionCreated, false);
  assert.equal(result.livenessEvaluated, false);
});
