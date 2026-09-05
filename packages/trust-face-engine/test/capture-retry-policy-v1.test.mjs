import assert from "node:assert/strict";
import test from "node:test";

import { buildCaptureRetryV1 } from "../src/capture-retry-policy-v1.mjs";

test("maps yaw rejection to a clear recapture action", () => {
  const retry = buildCaptureRetryV1({
    accepted: false,
    retryCapture: true,
    reasons: ["pose_yaw_out_of_lab_range"],
  });

  assert.equal(retry.required, true);
  assert.equal(retry.primaryAction, "center_face");
  assert.equal(retry.retryBeforeSFace, true);
  assert.equal(retry.sfaceInferenceAttempted, false);
  assert.equal(retry.productionReady, false);
});

test("preserves multiple pose reasons without claiming production readiness", () => {
  const retry = buildCaptureRetryV1( {
    accepted: false,
    retryCapture: true,
    reasons: [
      "pose_roll_out_of_lab_range",
      "pose_eye_span_too_small",
    ],
  });

  assert.deepEqual(retry.reasonCodes, [
    "pose_roll_out_of_lab_range",
    "pose_eye_span_too_small",
  ]);
  assert.deepEqual(retry.actions.map((action) => action.code), [
    "level_head",
    "move_closer",
  ]);
  assert.equal(retry.biometricClaimReady, false);
});
