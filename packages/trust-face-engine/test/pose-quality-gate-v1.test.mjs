import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_YUNET_POSE_QUALITY_V1 as PROFILE,
  evaluateYuNetPoseQualityV1,
  assertYuNetPoseQualityForSFaceV1,
} from "../src/pose-quality-gate-v1.mjs";

const frontal = [
  10, 20, 100, 120,
  35, 55,
  75, 55,
  55, 80,
  40, 105,
  70, 105,
  0.97,
];

test("profile remains laboratory-only and fail-closed", () => {
  assert.equal(PROFILE.maxYawProxy, 0.30);
  assert.equal(PROFILE.maxRollProxy, 0.25);
  assert.equal(PROFILE.minEyeSpanBoxRatio, 0.35);
  assert.equal(PROFILE.thresholdCalibrated, false);
  assert.equal(PROFILE.productionReady, false);
  assert.equal(PROFILE.biometricClaimReady, false);
});

test("accepts a moderate frontal YuNet geometry", () => {
  const result = evaluateYuNetPoseQualityV1(frontal);
  assert.equal(result.accepted, true);
  assert.equal(result.retryCapture, false);
  assert.deepEqual(result.reasons, []);
});

test("rejects a strong profile before SFace inference", () => {
  const result = evaluateYuNetPoseQualityV1([
    10, 20, 100, 120,
    40, 55,
    60, 55,
    80, 78,
    50, 105,
    72, 105,
    0.95,
  ]);
  assert.equal(result.accepted, false);
  assert.equal(result.retryCapture, true);
  assert.ok(result.reasons.includes("pose_yaw_out_of_lab_range"));
  assert.ok(result.reasons.includes("pose_eye_span_too_small"));
  assert.throws(
    () => assertYuNetPoseQualityForSFaceV1([
      10, 20, 100, 120,
      40, 55,
      60, 55,
      80, 78,
      50, 105,
      72, 105,
      0.95,
    ]),
    (error) => error.code === "pose_quality_gate_rejected",
  );
});

test("rejects excessive roll geometry", () => {
  const result = evaluateYuNetPoseQualityV1([
    10, 20, 100, 120,
    35, 45,
    75, 65,
    55, 82,
    40, 105,
    70, 105,
    0.95,
  ]);
  assert.equal(result.accepted, false);
  assert.ok(result.reasons.includes("pose_roll_out_of_lab_range"));
});

test("rejects malformed landmarks", () => {
  assert.throws(
    () => evaluateYuNetPoseQualityV1([1, 2, 3]),
    (error) => error.code === "invalid_pose_face_box",
  );
});
