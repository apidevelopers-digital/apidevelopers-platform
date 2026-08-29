import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CNN_BACKPROP_LAB_PROFILE,
  makeSyntheticCnnBatch,
  runCnnBackpropSmokeTraining,
} from "../src/cnn-backprop-lab.mjs";

test("cnn backprop lab remains synthetic and non-production", () => {
  assert.equal(TRUST_FACE_CNN_BACKPROP_LAB_PROFILE.productionReady, false);
  assert.equal(TRUST_FACE_CNN_BACKPROP_LAB_PROFILE.biometricClaimReady, false);
  assert.equal(TRUST_FACE_CNN_BACKPROP_LAB_PROFILE.biometricBackboneReady, false);
  assert.equal(TRUST_FACE_CNN_BACKPROP_LAB_PROFILE.realBiometricTrainingAuthorized, false);
});

test("synthetic cnn batch is deterministic for a fixed seed", () => {
  const a = makeSyntheticCnnBatch({ samplesPerClass: 4, seed: 17 });
  const b = makeSyntheticCnnBatch({ samplesPerClass: 4, seed: 17 });
  assert.deepEqual(a, b);
  assert.equal(a.authorityBasis, "synthetic");
  assert.equal(a.samples.length, 8);
});

test("real convolution gradients update kernel and improve synthetic loss", () => {
  const result = runCnnBackpropSmokeTraining({ seed: 9, epochs: 60, learningRate: 0.08, samplesPerClass: 10 });
  assert.equal(result.realBackpropagation, true);
  assert.equal(result.convolutionWeightsUpdated, true);
  assert.equal(result.gradientObserved, true);
  assert.equal(result.lossImproved, true);
  assert.ok(result.final.meanLoss < result.initial.meanLoss);
  assert.ok(result.final.accuracy >= 0.9);
  assert.ok(result.checkpointDigest.startsWith("sha256:"));
  assert.equal(result.biometricBackboneReady, false);
  assert.equal(result.productionReady, false);
});

test("cnn backprop smoke run is reproducible", () => {
  const input = { seed: 3, epochs: 45, learningRate: 0.06, samplesPerClass: 8 };
  assert.deepEqual(runCnnBackpropSmokeTraining(input), runCnnBackpropSmokeTraining(input));
});
