import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_BACKBONE_INFERENCE_V1,
  createSyntheticBackboneCheckpoint,
  inferSyntheticBackboneEmbedding,
} from "../src/backbone-inference-v1.mjs";

function syntheticSample(offset = 0) {
  const pixels = Array.from({ length: 112 * 112 * 3 }, (_, i) =>
    ((i % 97) / 96) * 0.7 + offset);
  return Object.freeze({
    width: 112,
    height: 112,
    channels: 3,
    pixels: Object.freeze(pixels),
  });
}

test("backbone inference profile preserves canonical topology and safety limits", () => {
  assert.deepEqual(TRUST_FACE_BACKBONE_INFERENCE_V1.stageWidths, [64, 96, 160, 256]);
  assert.deepEqual(TRUST_FACE_BACKBONE_INFERENCE_V1.stageDepths, [1, 2, 3, 2]);
  assert.equal(TRUST_FACE_BACKBONE_INFERENCE_V1.blockCount, 8);
  assert.equal(TRUST_FACE_BACKBONE_INFERENCE_V1.embeddingDim, 512);
  assert.equal(TRUST_FACE_BACKBONE_INFERENCE_V1.trainedBiometricWeightsIncluded, false);
  assert.equal(TRUST_FACE_BACKBONE_INFERENCE_V1.biometricBackboneReady, false);
  assert.equal(TRUST_FACE_BACKBONE_INFERENCE_V1.productionReady, false);
});

test("synthetic checkpoint is deterministic and contains eight canonical blocks", () => {
  const a = createSyntheticBackboneCheckpoint({ seed: 111 });
  const b = createSyntheticBackboneCheckpoint({ seed: 111 });
  assert.equal(a.blockCount, 8);
  assert.equal(a.embeddingDim, 512);
  assert.equal(a.checkpointDigest, b.checkpointDigest);
  assert.match(a.checkpointDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a.trainedBiometricWeightsIncluded, false);
});

test("synthetic inference returns deterministic normalized 512D embedding", () => {
  const checkpoint = createSyntheticBackboneCheckpoint({ seed: 113 });
  const sample = syntheticSample();
  const a = inferSyntheticBackboneEmbedding({ sample, checkpoint });
  const b = inferSyntheticBackboneEmbedding({ sample, checkpoint });
  assert.deepEqual(a, b);
  assert.equal(a.embedding.length, 512);
  assert.equal(a.embeddingNormApproximatelyOne, true);
  assert.equal(a.biometricBackboneReady, false);
  assert.equal(a.productionReady, false);
});

test("different synthetic samples produce different embeddings", () => {
  const checkpoint = createSyntheticBackboneCheckpoint({ seed: 127 });
  const a = inferSyntheticBackboneEmbedding({ sample: syntheticSample(0), checkpoint });
  const b = inferSyntheticBackboneEmbedding({ sample: syntheticSample(0.05), checkpoint });
  assert.notDeepEqual(a.embedding, b.embedding);
});

test("consented-real inference remains blocked without trained biometric weights", () => {
  const checkpoint = createSyntheticBackboneCheckpoint({ seed: 131 });
  assert.throws(
    () => inferSyntheticBackboneEmbedding({
      sample: syntheticSample(),
      checkpoint,
      execution: { mode: "consented-real", realBiometricInferenceAuthorized: true },
    }),
    (error) => error?.code === "real_biometric_inference_not_ready",
  );
});
