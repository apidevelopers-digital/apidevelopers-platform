import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_RESIDUAL_BACKPROP_LAB_V1_PROFILE,
  makeSyntheticResidualBatch,
  runResidualBackpropSmokeTraining,
} from "../src/residual-backprop-lab-v1.mjs";

test("residual lab preserves 112x112 RGB -> 512D boundary without production claims", () => {
  assert.equal(TRUST_FACE_RESIDUAL_BACKPROP_LAB_V1_PROFILE.input.width, 112);
  assert.equal(TRUST_FACE_RESIDUAL_BACKPROP_LAB_V1_PROFILE.input.height, 112);
  assert.equal(TRUST_FACE_RESIDUAL_BACKPROP_LAB_V1_PROFILE.input.channels, 3);
  assert.equal(TRUST_FACE_RESIDUAL_BACKPROP_LAB_V1_PROFILE.embeddingDim, 512);
  assert.equal(TRUST_FACE_RESIDUAL_BACKPROP_LAB_V1_PROFILE.normalizedEmbedding, true);
  assert.equal(TRUST_FACE_RESIDUAL_BACKPROP_LAB_V1_PROFILE.canonicalFourStageBackboneReady, false);
  assert.equal(TRUST_FACE_RESIDUAL_BACKPROP_LAB_V1_PROFILE.biometricBackboneReady, false);
  assert.equal(TRUST_FACE_RESIDUAL_BACKPROP_LAB_V1_PROFILE.productionReady, false);
  assert.equal(TRUST_FACE_RESIDUAL_BACKPROP_LAB_V1_PROFILE.realBiometricTrainingAuthorized, false);
});

test("synthetic residual batch is deterministic and contains only synthetic authority", () => {
  const a = makeSyntheticResidualBatch({ samplesPerClass: 2, seed: 11 });
  const b = makeSyntheticResidualBatch({ samplesPerClass: 2, seed: 11 });
  assert.deepEqual(a, b);
  assert.equal(a.authorityBasis, "synthetic");
  assert.equal(a.samples.length, 4);
  assert.equal(a.samples[0].pixels.length, 112 * 112 * 3);
});

test("residual backprop reaches trainable path and 512D projection while reducing synthetic loss", () => {
  const result = runResidualBackpropSmokeTraining({
    seed: 7,
    epochs: 8,
    learningRate: 0.025,
    samplesPerClass: 2,
  });

  assert.equal(result.lossImproved, true);
  assert.equal(result.gradientObserved, true);
  assert.equal(result.residualPathTrained, true);
  assert.equal(result.projection512Updated, true);
  assert.equal(result.normalizedEmbeddingPath, true);
  assert.ok(result.final.meanLoss < result.initial.meanLoss);
  assert.ok(result.checkpointDigest.startsWith("sha256:"));
  assert.equal(result.canonicalFourStageBackboneReady, false);
  assert.equal(result.biometricBackboneReady, false);
  assert.equal(result.productionReady, false);
  assert.equal(result.biometricClaimReady, false);
});

test("residual smoke training is reproducible for the same seed and hyperparameters", () => {
  const input = { seed: 5, epochs: 3, learningRate: 0.02, samplesPerClass: 2 };
  assert.deepEqual(
    runResidualBackpropSmokeTraining(input),
    runResidualBackpropSmokeTraining(input),
  );
});
