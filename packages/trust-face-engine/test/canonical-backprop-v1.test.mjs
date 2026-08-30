import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CANONICAL_BACKPROP_V1,
  makeCanonicalSyntheticBatch,
  runCanonicalBackpropSyntheticTraining,
} from "../src/canonical-backprop-v1.mjs";

test("canonical backprop profile keeps biometric/production claims disabled", () => {
  assert.equal(TRUST_FACE_CANONICAL_BACKPROP_V1.canonicalGraphBackpropReady, true);
  assert.equal(TRUST_FACE_CANONICAL_BACKPROP_V1.spatialConvolutionBackpropReady, false);
  assert.equal(TRUST_FACE_CANONICAL_BACKPROP_V1.biometricBackboneReady, false);
  assert.equal(TRUST_FACE_CANONICAL_BACKPROP_V1.productionReady, false);
  assert.equal(TRUST_FACE_CANONICAL_BACKPROP_V1.biometricClaimReady, false);
  assert.equal(TRUST_FACE_CANONICAL_BACKPROP_V1.realBiometricTrainingAuthorized, false);
});

test("synthetic fixture remains 112x112 RGB and contains no biometric authority", () => {
  const batch = makeCanonicalSyntheticBatch({ classCount: 3, samplesPerClass: 1, seed: 19 });
  assert.equal(batch.authorityBasis, "synthetic");
  assert.equal(batch.samples.length, 3);
  for (const sample of batch.samples) {
    assert.equal(sample.width, 112);
    assert.equal(sample.height, 112);
    assert.equal(sample.channels, 3);
    assert.equal(sample.pixels.length, 37632);
  }
});

test("gradient reaches and updates all eight canonical residual blocks", () => {
  const result = runCanonicalBackpropSyntheticTraining({
    seed: 13,
    classCount: 3,
    samplesPerClass: 2,
    epochs: 3,
    learningRate: 0.0005,
    scale: 12,
    marginRadians: 0.15,
  });

  assert.equal(result.blockCount, 8);
  assert.deepEqual(result.stageWidths, [64, 96, 160, 256]);
  assert.deepEqual(result.stageDepths, [1, 2, 3, 2]);
  assert.equal(result.embeddingDim, 512);
  assert.equal(result.gradientReachedAllBlocks, true);
  assert.equal(result.allBlocksUpdated, true);
  assert.equal(result.canonicalGraphBackpropReady, true);
  assert.equal(result.embeddingNormApproximatelyOne, true);
  assert.ok(result.blockGradientNorms.every((v) => Number.isFinite(v) && v > 0));
  assert.match(result.checkpointDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.spatialConvolutionBackpropReady, false);
  assert.equal(result.biometricBackboneReady, false);
  assert.equal(result.productionReady, false);
});
