import assert from "node:assert/strict";
import test from "node:test";

import { summarizeOpenCvYuNetSFaceRetryV1 } from "../src/yunet-sface-pair-comparison-v1.mjs";

const retry = Object.freeze({
  required: true,
  primaryAction: "center_face",
  reasonCodes: Object.freeze(["pose_yaw_out_of_lab_range"]),
});

test("pair comparison stops before cosine when reference requires recapture", () => {
  const result = summarizeOpenCvYuNetSFaceRetryV1(
    { status: "capture_retry_required", retry },
    { status: "inference_completed", retry: { required: false } },
  );

  assert.equal(result.comparisonCreated, false);
  assert.equal(result.retryCapture, true);
  assert.deepEqual(result.retryTargets, ["reference"]);
  assert.equal(result.cosineSimilarity, null);
  assert.equal(result.thresholdApplied, false);
  assert.equal(result.matchedClaimed, false);
});

test("pair comparison can request recapture of both sides", () => {
  const result = summarizeOpenCvYuNetSFaceRetryV1(
    { status: "capture_retry_required", retry },
    { status: "capture_retry_required", retry },
  );

  assert.deepEqual(result.retryTargets, ["reference", "probe"]);
  assert.equal(result.referenceRetry.primaryAction, "center_face");
  assert.equal(result.probeRetry.primaryAction, "center_face");
});
