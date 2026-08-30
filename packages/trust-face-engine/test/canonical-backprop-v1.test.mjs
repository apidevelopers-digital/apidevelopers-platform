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

const result = runCanonicalBackpropSyntheticTraining({
  seed: 13,
  classCount: 3,
  samplesPerClass: 2,
  epochs: 3,
  learningRate: 0.0005,
  scale: 12,
  marginRadians: 0.15,
});

test("canonical backprop topology remains 8 blocks / 4 stages / 512D", () => {
  assert.equal(result.blockCount, 8);
  assert.deepEqual(result.stageWidths, [64, 96, 160, 256]);
  assert.deepEqual(result.stageDepths, [1, 2, 3, 2]);
  assert.equal(result.embeddingDim, 512);
});

test("canonical backprop gradient reaches all 8 residual blocks", () => {
  assert.equal(result.gradientReachedAllBlocks, true);
});

test("canonical backprop updates parameters in all 8 residual blocks", () => {
  assert.equal(result.allBlocksUpdated, true);
});

test("canonical backprop reports ready only when gradient and updates both hold", () => {
  assert.equal(result.canonicalGraphBackpropReady, true);
});

test("canonical backprop keeps 512D embedding L2-normalized", () => {
  assert.equal(result.embeddingNormApproximatelyOne, true);
});

test("canonical backprop exposes finite non-zero gradient norm for every block", () => {
  assert.ok(result.blockGradientNorms.every((v) => Number.isFinite(v) && v > 0));
});

test("canonical backprop emits deterministic checkpoint digest", () => {
  assert.match(result.checkpointDigest, /^sha256:[0-9a-f]{64}$/);
});

test("canonical backprop keeps spatial/biometric/production readiness disabled", () => {
  assert.equal(result.spatialConvolutionBackpropReady, false);
  assert.equal(result.biometricBackboneReady, false);
  assert.equal(result.productionReady, false);
});
