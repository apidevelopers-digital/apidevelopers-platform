import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_SFACE_EXPERIMENTAL_BAND_V1,
  createExperimentalSFaceBandV1,
  evaluateExperimentalSFaceBandV1,
} from "../src/sface-experimental-threshold-band-v1.mjs";

test("derives a conservative experimental band from sanitized eligible evidence", () => {
  const profile = TRUST_FACE_SFACE_EXPERIMENTAL_BAND_V1;

  assert.equal(profile.identityCount, 4);
  assert.equal(profile.samePersonPairCount, 9);
  assert.equal(profile.differentPersonPairCount, 36);
  assert.equal(profile.observedGap, 0.373);
  assert.ok(Math.abs(profile.lowSimilarityMax - 0.31725) < 1e-12);
  assert.ok(Math.abs(profile.highSimilarityMin - 0.50375) < 1e-12);
  assert.equal(profile.thresholdCalibrated, false);
  assert.equal(profile.biometricClaimReady, false);
});

test("classifies low similarity without creating a biometric claim", () => {
  const result = evaluateExperimentalSFaceBandV1(0.224);

  assert.equal(result.classification, "low_similarity");
  assert.equal(result.retryCapture, false);
  assert.equal(result.experimentalBandApplied, true);
  assert.equal(result.thresholdApplied, false);
  assert.equal(result.matchedClaimed, false);
  assert.equal(result.identityClaimed, false);
  assert.equal(result.productionReady, false);
});

test("uses an explicit indeterminate zone that requires another admitted capture", () => {
  const result = evaluateExperimentalSFaceBandV1(0.4);

  assert.equal(result.classification, "indeterminate_retry");
  assert.equal(result.retryCapture, true);
  assert.equal(result.retryReason, "experimental_similarity_indeterminate");
  assert.equal(result.thresholdApplied, false);
  assert.equal(result.matchedClaimed, false);
});

test("classifies high similarity experimentally without claiming a match", () => {
  const result = evaluateExperimentalSFaceBandV1(0.597);

  assert.equal(result.classification, "high_similarity");
  assert.equal(result.retryCapture, false);
  assert.equal(result.matchedClaimed, false);
  assert.equal(result.identityClaimed, false);
  assert.equal(result.thresholdCalibrated, false);
});

test("rejects overlapping evidence instead of inventing a band", () => {
  assert.throws(
    () =>
      createExperimentalSFaceBandV1({
        identityCount: 4,
        samePersonPairCount: 9,
        differentPersonPairCount: 36,
        samePersonObservedMin: 0.2,
        differentPersonObservedMax: 0.3,
      }),
    /same-person minimum/,
  );
});

test("rejects invalid guard fractions", () => {
  assert.throws(
    () =>
      createExperimentalSFaceBandV1({
        identityCount: 4,
        samePersonPairCount: 9,
        differentPersonPairCount: 36,
        samePersonObservedMin: 0.597,
        differentPersonObservedMax: 0.224,
        guardFraction: 0.5,
      }),
    /guardFraction/,
  );
});
