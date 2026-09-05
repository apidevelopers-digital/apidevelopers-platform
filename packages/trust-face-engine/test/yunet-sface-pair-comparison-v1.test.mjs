import assert from "node:assert/strict";
import test from "node:test";

import { summarizeOpenCvYuNetSFacePairV1 } from "../src/yunet-sface-pair-comparison-v1.mjs";

const embedding = (vector) => ({
  modelVersion: "opencv-sface-2021dec@47534e27c9851bb1128ccc0102f1145e27f23f98",
  vector,
});

test("summarizes cosine without asserting a biometric match", () => {
  const result = summarizeOpenCvYuNetSFacePairV1({
    referenceInference: { embedding: embedding([1, 0, 0]) },
    probeInference: { embedding: embedding([0.8, 0.6, 0]) },
  });
  assert.ok(Math.abs(result.cosineSimilarity - 0.8) < 1e-12);
  assert.equal(result.thresholdApplied, false);
  assert.equal(result.matchedClaimed, false);
  assert.equal(result.embeddingStored, false);
  assert.equal(result.productionReady, false);
  assert.equal(result.biometricClaimReady, false);
});

test("model-version mismatches fail closed through the core cosine contract", () => {
  assert.throws(
    () => summarizeOpenCvYuNetSFacePairV1( {
      referenceInference: { embedding: embedding([1, 0, 0]) },
      probeInference: {
        embedding: {
          modelVersion: "different-model",
          vector: [1, 0, 0],
        },
      },
    }),
    (error) => error.code === "model_version_mismatch",
  );
});
