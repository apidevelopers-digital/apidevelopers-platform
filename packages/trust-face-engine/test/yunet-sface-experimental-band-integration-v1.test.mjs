import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizeOpenCvYuNetSFacePairV1,
  summarizeOpenCvYuNetSFaceRetryV1,
} from "../src/yunet-sface-pair-comparison-v1.mjs";

function inference(vector) {
  return {
    embedding: {
      modelVersion: "opencv-sface-2021dec",
      vector,
    },
  };
}

test("keeps the experimental band disabled by default", () => {
  const result = summarizeOpenCvYuNetSFacePairV1({
    referenceInference: inference([1, 0, 0]),
    probeInference: inference([1, 0, 0]),
  });

  assert.equal(result.experimentalBandApplied, false);
  assert.equal(result.experimentalBand, null);
  assert.equal(result.verificationRetryRequired, false);
  assert.equal(result.thresholdApplied, false);
  assert.equal(result.matchedClaimed, false);
});

test("applies the experimental band only when explicitly enabled", () => {
  const y = Math.sqrt(1 - 0.4 ** 2);
  const result = summarizeOpenCvYuNetSFacePairV1({
    referenceInference: inference([1, 0, 0]),
    probeInference: inference([0.4, y, 0]),
    experimentalBandEnabled: true,
  });

  assert.equal(result.experimentalBandApplied, true);
  assert.equal(result.experimentalBand.classification, "indeterminate_retry");
  assert.equal(result.experimentalBand.retryCapture, true);
  assert.equal(result.verificationRetryRequired, true);
  assert.equal(result.thresholdApplied, false);
  assert.equal(result.matchedClaimed, false);
  assert.equal(result.identityClaimed, false);
});

test("high experimental similarity still does not create a match claim", () => {
  const y = Math.sqrt(1 - 0.8 ** 2);
  const result = summarizeOpenCvYuNetSFacePairV1({
    referenceInference: inference([1, 0, 0]),
    probeInference: inference([0.8, y, 0]),
    experimentalBandEnabled: true,
  });

  assert.equal(result.experimentalBand.classification, "high_similarity");
  assert.equal(result.verificationRetryRequired, false);
  assert.equal(result.matchedClaimed, false);
  assert.equal(result.identityClaimed, false);
  assert.equal(result.productionReady, false);
});

test("pose retry bypasses experimental band evaluation and cosine", () => {
  const result = summarizeOpenCvYuNetSFaceRetryV1(
    {
      status: "capture_retry_required",
      retry: { required: true, primaryAction: "center_face" },
    },
    {
      status: "inference_completed",
      retry: { required: false },
    },
  );

  assert.equal(result.comparisonCreated, false);
  assert.equal(result.cosineSimilarity, null);
  assert.equal(result.experimentalBandApplied, false);
  assert.equal(result.experimentalBand, null);
  assert.equal(result.verificationRetryRequired, true);
  assert.equal(result.thresholdApplied, false);
  assert.equal(result.matchedClaimed, false);
});
