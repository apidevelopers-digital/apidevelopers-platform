export const TRUST_FACE_CONTRODFACE10K_CANDIDATE_V1 = Object.freeze({
  version: "trust-face-external-benchmark-candidate/v1",
  mode: "lab-only",
  candidateId: "controlface10k-humingamelab-v1",
  sourceType: "synthetic_permissive",
  sourceProvider: "HuMInGameLab",
  sourceDataset: "ControlFace10K",
  sourceRepository: "https://huggingface.co/datasets/HuMInGameLab/ControlFace10K",
  sourceReadmeRevision: "a03589de1a9e028b2d16fa1eb0e019a6930e817c",
  sourceArchiveName: "controlface10k.zip",
  declaredLicense: "CC-BY-4.0",
  intendedUse: "face-recognition-evaluation",
  declaredIdentityCount: 3336,
  declaredImageCount: 10008,
  declaredImagesPerIdentity: 3,
  declaredPoseVariation: true,
  identityOverlapWithDerivation: false,
  derivationEvidenceId: "consented-four-identity-eligible-2026-09-04-v1",
  benchmarkOnly: true,
  bandFrozen: true,
  calibrationMutationAllowed: false,
  publicWebScrape: false,
  artifactMaterialized: false,
  artifactDigestVerified: false,
  artifactSha256: null,
  benchmarkExecutionAuthorized: false,
  thresholdCalibrated: false,
  farFmrValidated: false,
  frrFnmrValidated: false,
  productionAuthorized: false,
  productionReady: false,
  biometricClaimReady: false,
});

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

export function assessExternalBenchmarkCandidateV1(candidate = {}) {
  const sourceType = requiredString(candidate.sourceType, "sourceType");
  const declaredLicense = requiredString(candidate.declaredLicense, "declaredLicense");
  const candidateId = requiredString(candidate.candidateId, "candidateId");

  if (sourceType !== "synthetic_permissive" && sourceType !== "licensed_benchmark") {
    throw new Error(`external benchmark source type is not admissible: ${sourceType}`);
  }

  if (candidate.publicWebScrape !== false) {
    throw new Error("public web scrape is not admissible benchmark evidence");
  }

  if (candidate.identityOverlapWithDerivation !== false) {
    throw new Error("identity overlap with frozen derivation must be explicitly false");
  }

  if (candidate.benchmarkOnly !== true || candidate.bandFrozen !== true) {
    throw new Error("external evidence must remain benchmark-only against the frozen band");
  }

  if (candidate.calibrationMutationAllowed !== false) {
    throw new Error("external benchmark candidate cannot mutate calibration");
  }

  const materialized = candidate.artifactMaterialized === true;
  const digestVerified = candidate.artifactDigestVerified === true;
  const digest = candidate.artifactSha256;

  if (digestVerified) {
    if (!materialized) {
      throw new Error("artifact digest cannot be verified before materialization");
    }
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) {
      throw new Error("verified artifactSha256 must be a lowercase SHA-256 hex digest");
    }
  }

  const benchmarkExecutionAuthorized = materialized && digestVerified;

  return Object.freeze({
    version: "trust-face-external-benchmark-admission-state/v1",
    mode: "lab-only",
    candidateId,
    sourceType,
    declaredLicense,
    admissibleCandidate: true,
    artifactMaterialized: materialized,
    artifactDigestVerified: digestVerified,
    artifactSha256: digestVerified ? digest : null,
    benchmarkExecutionAuthorized,
    benchmarkOnly: true,
    bandFrozen: true,
    calibrationMutationAllowed: false,
    thresholdCalibrated: false,
    farFmrValidated: false,
    frrFnmrValidated: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function assertExternalBenchmarkReadyV1(candidate = {}) {
  const state = assessExternalBenchmarkCandidateV1(candidate);
  if (!state.benchmarkExecutionAuthorized) {
    throw new Error(
      "external benchmark is not ready: materialize the pinned artifact and verify SHA-256 first",
    );
  }
  return state;
}
