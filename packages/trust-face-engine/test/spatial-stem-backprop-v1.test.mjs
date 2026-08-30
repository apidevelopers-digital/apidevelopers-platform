import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_SPATIAL_STEM_BACKPROP_V1,
  makeSpatialStemSyntheticBatch,
  runSpatialStemBackpropSyntheticTraining,
} from "../src/spatial-stem-backprop-v1.mjs";

test("spatial stem profile preserves explicit non-biometric limits", () => {
  assert.deepEqual(TRUST_FACE_SPATIAL_STEM_BACKPROP_V1.inputShape, { width: 112, height: 112, channels: 3 });
  assert.equal(TRUST_FACE_SPATIAL_STEM_BACKPROP_V1.outputFeatureDim, 12);
  assert.equal(TRUST_FACE_SPATIAL_STEM_BACKPROP_V1.spatialStemBackpropReady, true);
  assert.equal(TRUST_FACE_SPATIAL_STEM_BACKPROP_V1.canonicalAngularMarginIntegrationReady, false);
  assert.equal(TRUST_FACE_SPATIAL_STEM_BACKPROP_V1.biometricBackboneReady, false);
  assert.equal(TRUST_FACE_SPATIAL_STEM_BACKPROP_V1.productionReady, false);
  assert.equal(TRUST_FACE_SPATIAL_STEM_BACKPROP_V1.realBiometricTrainingAuthorized, false);
});

test("112x112 RGB synthetic fixture is deterministic", () => {
  const a = makeSpatialStemSyntheticBatch({ classCount: 3, samplesPerClass: 1, seed: 31 });
  const b = makeSpatialStemSyntheticBatch({ classCount: 3, samplesPerClass: 1, seed: 31 });
  assert.deepEqual(a, b);
  assert.equal(a.authorityBasis, "synthetic");
  assert.equal(a.samples.length, 3);
  assert.equal(a.samples[0].pixels.length, 37632);
});

test("real 3x3 spatial stem backprop reaches kernel and pixel level and emits 12 features", () => {
  const result = runSpatialStemBackpropSyntheticTraining({
    seed: 37,
    classCount: 3,
    samplesPerClass: 2,
    epochs: 3,
    learningRate: 0.01,
  });
  assert.equal(result.outputFeatureDim, 12);
  assert.equal(result.kernelGradientObserved, true);
  assert.equal(result.pixelGradientObserved, true);
  assert.equal(result.spatialWeightsUpdated, true);
  assert.equal(result.spatialStemBackpropReady, true);
  assert.match(result.checkpointDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.canonicalAngularMarginIntegrationReady, false);
  assert.equal(result.biometricBackboneReady, false);
  assert.equal(result.productionReady, false);
});

test("spatial stem synthetic run is reproducible", () => {
  const cfg = { seed: 41, classCount: 3, samplesPerClass: 1, epochs: 2, learningRate: 0.01 };
  assert.deepEqual(runSpatialStemBackpropSyntheticTraining(cfg), runSpatialStemBackpropSyntheticTraining(cfg));
});
