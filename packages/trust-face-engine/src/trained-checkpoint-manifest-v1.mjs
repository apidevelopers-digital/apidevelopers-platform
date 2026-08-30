
import { createHash } from "node:crypto";

export const TRUST_FACE_TRAINED_CHECKPOINT_MANIFEST_V1 = Object.freeze({
  version: "trust-face-trained-checkpoint-manifest/v1",
  requiredEmbeddingDim: 512,
  requiredAuthorityForConsentedTraining: "consented-training",
  trainedBiometricWeightsIncludedByDefault: false,
  biometricBackboneReadyByDefault: false,
  productionReadyByDefault: false,
  biometricClaimReadyByDefault: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceTrainedCheckpointManifestV1Error";
  error.code = code;
  throw error;
}

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_manifest_field", `${field} is required`);
  }
  return value.trim();
}

function requireSha256(value, field) {
  const normalized = required(value, field);
  if (!/^sha256:[0-9a-f]{64}$/i.test(normalized)) {
    fail("invalid_digest", `${field} must be sha256:<64 hex>`);
  }
  return normalized.toLowerCase();
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

export function createTrainedCheckpointManifest({
  checkpointId,
  codeCommit,
  runSpecDigest,
  datasetManifestDigest,
  authorityBasis,
  authorizationId = null,
  embeddingDim = 512,
  backboneTopology = { stageWidths: [64, 96, 160, 256], stageDepths: [1, 2, 3, 2], blockCount: 8 },
  weightsDigest = null,
  trainingCompleted = false,
  evaluationCompleted = false,
  evaluationDigest = null,
  realBiometricTrainingAuthorized = false,
} = {}) {
  const id = required(checkpointId, "checkpointId");
  const commit = required(codeCommit, "codeCommit");
  const runDigest = requireSha256(runSpecDigest, "runSpecDigest");
  const datasetDigest = requireSha256(datasetManifestDigest, "datasetManifestDigest");

  if (!["synthetic", "public-licensed", "consented-training"].includes(authorityBasis)) {
    fail("unsupported_authority_basis", "authorityBasis is not supported");
  }

  if (embeddingDim !== 512) {
    fail("invalid_embedding_dim", "embeddingDim must be 512");
  }

  const trainedBiometricWeightsIncluded =
    authorityBasis === "consented-training" &&
    realBiometricTrainingAuthorized === true &&
    trainingCompleted === true &&
    typeof weightsDigest === "string" &&
    /^sha256:[0-9a-f]{64}$/i.test(weightsDigest) &&
    typeof authorizationId === "string" &&
    authorizationId.trim().length > 0;

  if (authorityBasis === "consented-training" && realBiometricTrainingAuthorized !== true) {
    fail("real_biometric_training_not_authorized", "consented-training requires explicit real biometric training authorization");
  }

  if (authorityBasis === "consented-training" && !authorizationId) {
    fail("missing_training_authorization_id", "authorizationId is required for consented-training");
  }

  if (trainingCompleted === true && !weightsDigest) {
    fail("missing_weights_digest", "weightsDigest is required when trainingCompleted=true");
  }

  if (evaluationCompleted === true && !evaluationDigest) {
    fail("missing_evaluation_digest", "evaluationDigest is required when evaluationCompleted=true");
  }

  const body = Object.freeze({
    version: TRUST_FACE_TRAINED_CHECKPOINT_MANIFEST_V1.version,
    checkpointId: id,
    codeCommit: commit,
    runSpecDigest: runDigest,
    datasetManifestDigest: datasetDigest,
    authorityBasis,
    authorizationId: authorizationId ? authorizationId.trim() : null,
    embeddingDim,
    backboneTopology: Object.freeze({
      stageWidths: Object.freeze([...backboneTopology.stageWidths]),
      stageDepths: Object.freeze([...backboneTopology.stageDepths]),
      blockCount: backboneTopology.blockCount,
    }),
    trainingCompleted: trainingCompleted === true,
    evaluationCompleted: evaluationCompleted === true,
    weightsDigest: weightsDigest ? requireSha256(weightsDigest, "weightsDigest") : null,
    evaluationDigest: evaluationDigest ? requireSha256(evaluationDigest, "evaluationDigest") : null,
    trainedBiometricWeightsIncluded,
    biometricBackboneReady: trainedBiometricWeightsIncluded && evaluationCompleted === true,
    productionReady: false,
    biometricClaimReady: false,
  });

  return Object.freeze({ ...body, manifestDigest: sha256(body) });
}
