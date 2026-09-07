import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_SFACE_HOLDOUT_STABILITY_V1,
  evaluateSFaceExperimentalHoldoutStabilityV1,
} from "../src/sface-experimental-band-stability-v1.mjs";

test("records the sanitized eight-fold holdout replay as sample-only stable", () => {
  const result = TRUST_FACE_SFACE_HOLDOUT_STABILITY_V1;

  assert.equal(result.foldCount, 8);
  assert.equal(result.sameEvaluationCount, 18);
  assert.equal(result.differentEvaluationCount, 70);
  assert.equal(result.stableForLabExploration, true);
  assert.equal(result.unsafeSameLow, false);
  assert.equal(result.unsafeDifferentHigh, false);
  assert.equal(result.indeterminateObserved, false);
  assert.equal(result.sameHighRate, 1);
  assert.equal(result.differentLowRate, 1);
  assert.equal(result.thresholdCalibrated, false);
  assert.equal(result.productionReady, false);
  assert.equal(result.biometricClaimReady, false);
});

test("fails lab stability when a same-person holdout falls into low similarity", () => {
  const result = evaluateSFaceExperimentalHoldoutStabilityV1({
    source: "test",
    foldCount: 3,
    sameEvaluationCount: 3,
    differentEvaluationCount: 6,
    sameHighCount: 2,
    sameIndeterminateCount: 0,
    sameLowCount: 1,
    differentLowCount: 6,
    differentIndeterminateCount: 0,
    differentHighCount: 0,
    foldObservedGapMin: 0.1,
    foldObservedGapMax: 0.2,
  });

  assert.equal(result.stableForLabExploration, false);
  assert.equal(result.unsafeSameLow, true);
});

test("fails lab stability when a different-person holdout reaches high similarity", () => {
  const result = evaluateSFaceExperimentalHoldoutStabilityV1({
    source: "test",
    foldCount: 3,
    sameEvaluationCount: 3,
    differentEvaluationCount: 6,
    sameHighCount: 3,
    sameIndeterminateCount: 0,
    sameLowCount: 0,
    differentLowCount: 5,
    differentIndeterminateCount: 0,
    differentHighCount: 1,
    foldObservedGapMin: 0.1,
    foldObservedGapMax: 0.2,
  });

  assert.equal(result.stableForLabExploration, false);
  assert.equal(result.unsafeDifferentHigh, true);
});

test("permits indeterminate holdout outcomes without creating a biometric claim", () => {
  const result = evaluateSFaceExperimentalHoldoutStabilityV1({
    source: "test",
    foldCount: 3,
    sameEvaluationCount: 3,
    differentEvaluationCount: 6,
    sameHighCount: 2,
    sameIndeterminateCount: 1,
    sameLowCount: 0,
    differentLowCount: 5,
    differentIndeterminateCount: 1,
    differentHighCount: 0,
    foldObservedGapMin: 0.1,
    foldObservedGapMax: 0.2,
  });

  assert.equal(result.stableForLabExploration, true);
  assert.equal(result.indeterminateObserved, true);
  assert.equal(result.thresholdCalibrated, false);
  assert.equal(result.identityClaimReady, false);
});

test("rejects inconsistent aggregate counts", () => {
  assert.throws(
    () =>
      evaluateSFaceExperimentalHoldoutStabilityV1({
        source: "test",
        foldCount: 3,
        sameEvaluationCount: 3,
        differentEvaluationCount: 6,
        sameHighCount: 3,
        sameIndeterminateCount: 1,
        sameLowCount: 0,
        differentLowCount: 6,
        differentIndeterminateCount: 0,
        differentHighCount: 0,
        foldObservedGapMin: 0.1,
        foldObservedGapMax: 0.2,
      }),
    /same-person classification counts/,
  );
});
