export const TRUST_FACE_SFACE_EXPERIMENTAL_EVIDENCE_V1 = Object.freeze({
  version: "trust-face-sface-experimental-evidence/v1",
  mode: "lab-only",
  source: "sanitized-consented-aggregate-2026-09-04",
  identityCount: 4,
  samePersonPairCount: 9,
  differentPersonPairCount: 36,
  samePersonObservedMin: 0.597,
  differentPersonObservedMax: 0.224,
  productionAuthorized: false,
  productionReady: false,
  biometricClaimReady: false,
});

function finite(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number`);
  }
  return value;
}

function boundedCosine(value, field) {
  const number = finite(value, field);
  if (number < -1 || number > 1) {
    throw new RangeError(`${field} must be between -1 and 1`);
  }
  return number;
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${field} must be a positive integer`);
  }
  return value;
}

export function createExperimentalSFaceBandV1({
  identityCount,
  samePersonPairCount,
  differentPersonPairCount,
  samePersonObservedMin,
  differentPersonObservedMax,
  guardFraction = 0.25,
  source = "sanitized-aggregate",
} = {}) {
  const identities = positiveInteger(identityCount, "identityCount");
  const samePairs = positiveInteger(samePersonPairCount, "samePersonPairCount");
  const differentPairs = positiveInteger(differentPersonPairCount, "differentPersonPairCount");
  const sameMin = boundedCosine(samePersonObservedMin, "samePersonObservedMin");
  const differentMax = boundedCosine(differentPersonObservedMax, "differentPersonObservedMax");
  const guard = finite(guardFraction, "guardFraction");

  if (identities < 2) {
    throw new RangeError("identityCount must be at least 2");
  }
  if (guard <= 0 || guard >= 0.5) {
    throw new RangeError("guardFraction must be greater than 0 and less than 0.5");
  }
  if (sameMin <= differentMax) {
    throw new RangeError("observed same-person minimum must be greater than observed different-person maximum");
  }

  const observedGap = sameMin - differentMax;
  const lowSimilarityMax = differentMax + observedGap * guard;
  const highSimilarityMin = sameMin - observedGap * guard;

  return Object.freeze({
    version: "trust-face-sface-experimental-threshold-band/v1",
    mode: "lab-only",
    source,
    calibrationStatus: "exploratory-sample-only",
    identityCount: identities,
    samePersonPairCount: samePairs,
    differentPersonPairCount: differentPairs,
    samePersonObservedMin: sameMin,
    differentPersonObservedMax: differentMax,
    observedGap,
    guardFraction: guard,
    lowSimilarityMax,
    highSimilarityMin,
    indeterminateMinExclusive: lowSimilarityMax,
    indeterminateMaxExclusive: highSimilarityMin,
    thresholdCalibrated: false,
    farFmrValidated: false,
    frrFnmrValidated: false,
    identityClaimReady: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export const TRUST_FACE_SFACE_EXPERIMENTAL_BAND_V1 = createExperimentalSFaceBandV1({
  ...TRUST_FACE_SFACE_EXPERIMENTAL_EVIDENCE_V1,
  guardFraction: 0.25,
});

export function evaluateExperimentalSFaceBandV1(
  cosineSimilarity,
  { profile = TRUST_FACE_SFACE_EXPERIMENTAL_BAND_V1 } = {},
) {
  const score = boundedCosine(cosineSimilarity, "cosineSimilarity");

  if (!profile || typeof profile !== "object") {
    throw new TypeError("profile must be an object");
  }

  const lowMax = boundedCosine(profile.lowSimilarityMax, "profile.lowSimilarityMax");
  const highMin = boundedCosine(profile.highSimilarityMin, "profile.highSimilarityMin");

  if (lowMax >= highMin) {
    throw new RangeError("profile must preserve a non-empty indeterminate zone");
  }

  let classification;
  let retryCapture = false;

  if (score <= lowMax) {
    classification = "low_similarity";
  } else if (score >= highMin) {
    classification = "high_similarity";
  } else {
    classification = "indeterminate_retry";
    retryCapture = true;
  }

  return Object.freeze({
    version: "trust-face-sface-experimental-band-evaluation/v1",
    mode: "lab-only",
    cosineSimilarity: score,
    classification,
    retryCapture,
    retryReason: retryCapture ? "experimental_similarity_indeterminate" : null,
    experimentalBandApplied: true,
    thresholdApplied: false,
    matchedClaimed: false,
    identityClaimed: false,
    decisionCreated: false,
    thresholdCalibrated: false,
    farFmrValidated: false,
    frrFnmrValidated: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
    band: Object.freeze({
      id: profile.version,
      lowSimilarityMax: lowMax,
      highSimilarityMin: highMin,
      observedGap: profile.observedGap,
      guardFraction: profile.guardFraction,
    }),
  });
}
