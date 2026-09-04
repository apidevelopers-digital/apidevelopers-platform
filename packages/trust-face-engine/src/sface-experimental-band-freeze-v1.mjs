import { createHash } from "node:crypto";

export const TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1 = Object.freeze({
  version: "trust-face-sface-experimental-band-freeze/v1",
  derivationEvidenceId: "consented-four-identity-eligible-2026-09-04-v1",
  frozenAt: "2026-09-04",
  frozenProfileSha256: "69870e817be79f29a4cbbdd0a69b63d13eac8d5475026cd7c8e6b211306c7a64",
  rederivationAllowed: false,
  independentEvidenceRequired: true,
  calibrationMutationAllowed: false,
  thresholdCalibrated: false,
  productionAuthorized: false,
  productionReady: false,
  biometricClaimReady: false,
  allowedIndependentEvidenceKinds: Object.freeze([
    "consented_new_collection",
    "synthetic_permissive",
    "licensed_benchmark",
  ]),
});

function canonicalBandSnapshot(profile) {
  if (!profile || typeof profile !== "object") {
    throw new TypeError("profile must be an object");
  }

  return {
    version: profile.version,
    source: profile.source,
    identityCount: profile.identityCount,
    samePersonPairCount: profile.samePersonPairCount,
    differentPersonPairCount: profile.differentPersonPairCount,
    samePersonObservedMin: profile.samePersonObservedMin,
    differentPersonObservedMax: profile.differentPersonObservedMax,
    observedGap: profile.observedGap,
    guardFraction: profile.guardFraction,
    lowSimilarityMax: profile.lowSimilarityMax,
    highSimilarityMin: profile.highSimilarityMin,
  };
}

export function fingerprintExperimentalSFaceBandV1(profile) {
  const canonical = JSON.stringify(canonicalBandSnapshot(profile));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function assertFrozenExperimentalSFaceBandV1(profile) {
  const actualProfileSha256 = fingerprintExperimentalSFaceBandV1(profile);
  const expectedProfileSha256 =
    TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.frozenProfileSha256;

  if (actualProfileSha256 !== expectedProfileSha256) {
    throw new Error(
      `experimental SFace band freeze mismatch: expected ${expectedProfileSha256}, got ${actualProfileSha256}`,
    );
  }

  return Object.freeze({
    version: TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.version,
    frozen: true,
    derivationEvidenceId:
      TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.derivationEvidenceId,
    actualProfileSha256,
    rederivationAllowed: false,
    independentEvidenceRequired: true,
    calibrationMutationAllowed: false,
    thresholdCalibrated: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

function nonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

export function admitIndependentSFaceEvidenceV1({
  evidenceId,
  evidenceKind,
  independentFromEvidenceIds,
  identityOverlapWithDerivation,
  admissibilityEvidence,
  calibrationMutationRequested = false,
  rawBiometricPayloadStored = false,
} = {}) {
  const normalizedEvidenceId = nonEmptyString(evidenceId, "evidenceId");
  const normalizedKind = nonEmptyString(evidenceKind, "evidenceKind");
  const normalizedAdmissibilityEvidence = nonEmptyString(
    admissibilityEvidence,
    "admissibilityEvidence",
  );

  if (
    normalizedEvidenceId ===
    TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.derivationEvidenceId
  ) {
    throw new Error("independent evidence must not reuse the derivation evidence id");
  }

  if (
    !TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.allowedIndependentEvidenceKinds.includes(
      normalizedKind,
    )
  ) {
    throw new Error(`evidenceKind is not admissible: ${normalizedKind}`);
  }

  if (!Array.isArray(independentFromEvidenceIds)) {
    throw new TypeError("independentFromEvidenceIds must be an array");
  }

  if (
    !independentFromEvidenceIds.includes(
      TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.derivationEvidenceId,
    )
  ) {
    throw new Error("independent evidence must explicitly declare independence from the frozen derivation set");
  }

  if (identityOverlapWithDerivation !== false) {
    throw new Error("identityOverlapWithDerivation must be explicitly false");
  }

  if (calibrationMutationRequested !== false) {
    throw new Error("independent evidence admission cannot mutate the frozen calibration band");
  }

  if (rawBiometricPayloadStored !== false) {
    throw new Error("raw biometric payload storage is not allowed by this admission contract");
  }

  return Object.freeze({
    version: "trust-face-sface-independent-evidence-admission/v1",
    mode: "lab-only",
    admitted: true,
    evidenceId: normalizedEvidenceId,
    evidenceKind: normalizedKind,
    admissibilityEvidence: normalizedAdmissibilityEvidence,
    derivationEvidenceId:
      TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.derivationEvidenceId,
    independentFromFrozenDerivation: true,
    benchmarkOnly: true,
    bandFrozen: true,
    calibrationMutationAllowed: false,
    thresholdCalibrated: false,
    farFmrValidated: false,
    frrFnmrValidated: false,
    identityClaimReady: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
