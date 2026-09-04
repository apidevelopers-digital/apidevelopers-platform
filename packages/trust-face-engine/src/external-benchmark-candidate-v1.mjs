export const TRUST_FACE_CONTROLFACE10K_CANDIDATE_V1 = Object.freeze({
  version: "trust-face-external-benchmark-candidate/v1",
  mode: "lab-only",
  candidateId: "controlface10k-humingamelab-v1",
  sourceType: "synthetic_permissive",
  sourceProvider: "HuMInGameLab",
  sourceDataset: "ControlFace10K",
  sourceRepository: "https://huggingface.co/datasets/HuMInGameLab/ControlFace10K",
  sourceReadmeRevision: "a03589de1a9e028b2d16fa1eb0e019a6930e817c",
  sourceArchiveName: "controlface10k.zip",
  sourceArchiveExpectedBytes: 3137641968,
  sourceArchiveExpectedSha256:
    "d0ed28b3271a75ac5bb8e6799fdfe78ba3a91fb7eddecf19d960ed18fe00a108",
  sourceArchivePointerEvidence: "huggingface-xet-pointer-main",
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
  artifactBytes: null,
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

function validSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function assessExternalBenchmarkCandidateV1(candidate = {}) {
  const sourceType = requiredString(candidate.sourceType, "sourceType");
  const declaredLicense = requiredString(candidate.declaredLicense, "declaredLicense");
  const candidateId = requiredString(candidate.candidateId, "candidateId");
  const expectedSha256 = requiredString(
    candidate.sourceArchiveExpectedSha256,
    "sourceArchiveExpectedSha256",
  );

  if (!validSha256(expectedSha256)) {
    throw new Error("sourceArchiveExpectedSha256 must be a lowercase SHA-256 hex digest");
  }

  if (
    !Number.isInteger(candidate.sourceArchiveExpectedBytes) ||
    candidate.sourceArchiveExpectedBytes < 1
  ) {
    throw new Error("sourceArchiveExpectedBytes must be a positive integer");
  }

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
  const bytes = candidate.artifactBytes;

  if (digestVerified) {
    if (!materialized) {
      throw new Error("artifact digest cannot be verified before materialization");
    }
    if (!validSha256(digest)) {
      throw new Error("verified artifactSha256 must be a lowercase SHA-256 hex digest");
    }
    if (digest !== expectedSha256) {
      throw new Error("materialized archive SHA-256 does not match pinned source digest");
    }
    if (!Number.isInteger(bytes) || bytes !== candidate.sourceArchiveExpectedBytes) {
      throw new Error("materialized archive byte size does not match pinned source size");
    }
  }

  const benchmarkExecutionAuthorized = materialized && digestVerified;

  return Object.freeze({
    version: "trust-face-external-benchmark-admission-state/v1",
    mode: "lab-only",
    candidateId,
    sourceType,
    declaredLicense,
    sourceArchiveExpectedBytes: candidate.sourceArchiveExpectedBytes,
    sourceArchiveExpectedSha256: expectedSha256,
    admissibleCandidate: true,
    artifactMaterialized: materialized,
    artifactDigestVerified: digestVerified,
    artifactSha256: digestVerified ? digest : null,
    artifactBytes: digestVerified ? bytes : null,
    benchmarkExecutionAuthorized,
    benchmarkOnly: true,
    bandFrozen: true,
    calibrationMutationAlowed: false,
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
      "external benchmark is not ready: materialize the pinned artifact and verify SHA-256 and byte size first",
    );
  }
  return state;
}
