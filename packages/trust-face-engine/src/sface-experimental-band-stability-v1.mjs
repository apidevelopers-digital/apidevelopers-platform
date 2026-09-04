export const TRUST_FACE_SFACE_HOLDOUT_EVIDENCE_V1 = Object.freeze({
  version: "trust-face-sface-holdout-evidence/v1",
  mode: "lab-only",
  source: "sanitized-consented-holdout-2026-09-04",
  foldCount: 8,
  sameEvaluationCount: 18,
  differentEvaluationCount: 70,
  sameHighCount: 18,
  sameIndeterminateCount: 0,
  sameLowCount: 0,
  differentLowCount: 70,
  differentIndeterminateCount: 0,
  differentHighCount: 0,
  foldObservedGapMin: 0.3726015749867317,
  foldObservedGapMax: 0.5204459079793693,
  foldLowSimilarityMaxMin: 0.29027841900004603,
  foldLowSimilarityMaxMax: 0.34542561393597865,
  foldHighSimilarityMinMin: 0.4947653181811851,
  foldHighSimilarityMinMax: 0.5874624562378901,
  productionAuthorized: false,
  productionReady: false,
  biometricClaimReady: false,
});

function nonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative integer`);
  }
  return value;
}

function finite(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number`);
  }
  return value;
}

export function evaluateSFaceExperimentalHoldoutStabilityV1(evidence = TRUST_FACE_SFACE_HOLDOUT_EVIDENCE_V1) {
  if (!evidence || typeof evidence !== "object") {
    throw new TypeError("evidence must be an object");
  }

  const foldCount = nonNegativeInteger(evidence.foldCount, "foldCount");
  const sameEvaluationCount = nonNegativeInteger(evidence.sameEvaluationCount, "sameEvaluationCount");
  const differentEvaluationCount = nonNegativeInteger(evidence.differentEvaluationCount, "differentEvaluationCount");
  const sameHighCount = nonNegativeInteger(evidence.sameHighCount, "sameHighCount");
  const sameIndeterminateCount = nonNegativeInteger(evidence.sameIndeterminateCount, "sameIndeterminateCount");
  const sameLowCount = nonNegativeInteger(evidence.sameLowCount, "sameLowCount");
  const differentLowCount = nonNegativeInteger(evidence.differentLowCount, "differentLowCount");
  const differentIndeterminateCount = nonNegativeInteger(evidence.differentIndeterminateCount, "differentIndeterminateCount");
  const differentHighCount = nonNegativeInteger(evidence.differentHighCount, "differentHighCount");

  if (foldCount < 2) throw new RangeError("foldCount must be at least 2");
  if (sameEvaluationCount < 1 || differentEvaluationCount < 1) {
    throw new RangeError("holdout replay must include same-person and different-person evaluations");
  }
  if (sameHighCount + sameIndeterminateCount + sameLowCount !== sameEvaluationCount) {
    throw new RangeError("same-person classification counts must equal sameEvaluationCount");
  }
  if (differentLowCount + differentIndeterminateCount + differentHighCount !== differentEvaluationCount) {
    throw new RangeError("different-person classification counts must equal differentEvaluationCount");
  }

  const gapMin = finite(evidence.foldObservedGapMin, "foldObservedGapMin");
  const gapMax = finite(evidence.foldObservedGapMax, "foldObservedGapMax");
  if (gapMin <= 0 || gapMax < gapMin) {
    throw new RangeError("all holdout folds must preserve a positive observed gap");
  }

  const unsafeSameLow = sameLowCount > 0;
  const unsafeDifferentHigh = differentHighCount > 0;
  const stableForLabExploration = !unsafeSameLow && !unsafeDifferentHigh;

  return Object.freeze({
    version: "trust-face-sface-holdout-stability/v1",
    mode: "lab-only",
    source: evidence.source,
    foldCount,
    sameEvaluationCount,
    differentEvaluationCount,
    stableForLabExploration,
    unsafeSameLow,
    unsafeDifferentHigh,
    indeterminateObserved:
      sameIndeterminateCount > 0 || differentIndeterminateCount > 0,
    sameHighRate: sameHighCount / sameEvaluationCount,
    differentLowRate: differentLowCount / differentEvaluationCount,
    foldObservedGapMin: gapMin,
    foldObservedGapMax: gapMax,
    thresholdCalibrated: false,
    farFmrValidated: false,
    frrFnmrValidated: false,
    identityClaimReady: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export const TRUST_FACE_SFACE_HOLDOUT_STABILITY_V1 =
  evaluateSFaceExperimentalHoldoutStabilityV1();
