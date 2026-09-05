import { createHash } from "node:crypto";

const DERIVATION_ID = "consented-four-identity-eligible-2026-09-04-v1";
const FROZEN_SHA256 = "69870e817be79f29a4cbbdd0a69b63d13eac8d5475026cd7c8e6b211306c7a64";

export const TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1 = Object.freeze({
  version: "trust-face-sface-experimental-band-freeze/v1",
  derivationEvidenceId: DERIVATION_ID,
  frozenAt: "2026-09-04",
  frozenProfileSha256: FROZEN_SHA256,
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

function n(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number`);
  }
  return Number(value.toFixed(12));
}

function snapshot(profile) {
  if (!profile || typeof profile !== "object") {
    throw new TypeError("profile must be an object");
  }
  return {
    version: profile.version,
    source: profile.source,
    identityCount: profile.identityCount,
    samePersonPairCount: profile.samePersonPairCount,
    differentPersonPairCount: profile.differentPersonPairCount,
    samePersonObservedMin: n(profile.samePersonObservedMin, "samePersonObservedMin"),
    differentPersonObservedMax: n(profile.differentPersonObservedMax, "differentPersonObservedMax"),
    observedGap: n(profile.observedGap, "observedGap"),
    guardFraction: n(profile.guardFraction, "guardFraction"),
    lowSimilarityMax: n(profile.lowSimilarityMax, "lowSimilarityMax"),
    highSimilarityMin: n(profile.highSimilarityMin, "highSimilarityMin"),
  };
}

export function fingerprintExperimentalSFaceBandV1(profile) {
  return createHash("sha256").update(JSON.stringify(snapshot(profile))).digest("hex");
}

export function assertFrozenExperimentalSFaceBandV1(profile) {
  const actualProfileSha256 = fingerprintExperimentalSFaceBandV1(profile);
  if (actualProfileSha256 !== FROZEN_SHA256) {
    throw new Error(`experimental SFace band freeze mismatch: expected ${FROZEN_SHA256}, got ${actualProfileSha256}`);
  }
  return Object.freeze({
    version: TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.version,
    frozen: true,
    derivationEvidenceId: DERIVATION_ID,
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

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
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
  const id = requiredText(evidenceId, "evidenceId");
  const kind = requiredText(evidenceKind, "evidenceKind");
  const admissibility = requiredText(admissibilityEvidence, "admissibilityEvidence");

  if (id === DERIVATION_ID) throw new Error("independent evidence must not reuse the derivation evidence id");
  if (!TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.allowedIndependentEvidenceKinds.includes(kind)) {
    throw new Error(`evidenceKind is not admissible: ${kind}`);
  }
  if (!Array.isArray(independentFromEvidenceIds) || !independentFromEvidenceIds.includes(DERIVATION_ID)) {
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
    evidenceId: id,
    evidenceKind: kind,
    admissibilityEvidence: admissibility,
    derivationEvidenceId: DERIVATION_ID,
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
