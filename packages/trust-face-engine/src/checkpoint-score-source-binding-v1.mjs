import { createHash } from "node:crypto";
import { createConsentedScoreSourceManifest } from "./consented-score-source-manifest-v1.mjs";

export const TRUST_FACE_CHECKPOINT_SCORE_SOURCE_BINDING_V1 = Object.freeze({
  version: "trust-face-checkpoint-score-source-binding/v1",
  acceptedCheckpointManifestVersion: "trust-face-trained-checkpoint-manifest/v1",
  acceptedAuthorityBases: Object.freeze(["synthetic", "public-licensed", "consented-training"]),
  requiredEmbeddingDim: 512,
  evaluationOnly: true,
  trainingAuthorized: false,
  originAttested: false,
  realMetricsReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceCheckpointScoreSourceBindingV1Error";
  error.code = code;
  throw error;
}
function required(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_binding_field", `${field} is required`);
  return value.trim();
}
function digest(value, field) {
  const normalized = required(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) fail("invalid_binding_digest", `${field} must be sha256:<64 hex>`);
  return normalized;
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(value) {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}
function assertCheckpoint(checkpointManifest, codeCommit) {
  if (!checkpointManifest || typeof checkpointManifest !== "object" || Array.isArray(checkpointManifest)) fail("checkpoint_manifest_required", "trained checkpoint manifest is required");
  if (checkpointManifest.version !== TRUST_FACE_CHECKPOINT_SCORE_SOURCE_BINDING_V1.acceptedCheckpointManifestVersion) fail("checkpoint_manifest_version_mismatch", "unsupported checkpoint manifest version");
  if (!TRUST_FACE_CHECKPOINT_SCORE_SOURCE_BINDING_V1.acceptedAuthorityBases.includes(checkpointManifest.authorityBasis)) fail("checkpoint_authority_mismatch", "checkpoint authorityBasis is unsupported");
  if (checkpointManifest.embeddingDim !== 512) fail("checkpoint_embedding_dim_mismatch", "checkpoint embeddingDim must be 512");
  if (checkpointManifest.codeCommit !== codeCommit) fail("checkpoint_commit_mismatch", "checkpoint codeCommit mismatch");
  const manifestDigest = digest(checkpointManifest.manifestDigest, "checkpointManifest.manifestDigest");
  const weightsDigest = digest(checkpointManifest.weightsDigest, "checkpointManifest.weightsDigest");
  if (checkpointManifest.trainingCompleted !== true) fail("checkpoint_training_incomplete", "checkpoint trainingCompleted must be true");
  if (checkpointManifest.evaluationCompleted !== true) fail("checkpoint_evaluation_incomplete", "checkpoint evaluationCompleted must be true");
  if (checkpointManifest.productionReady !== false || checkpointManifest.biometricClaimReady !== false) fail("checkpoint_claim_state_invalid", "checkpoint must remain non-production and non-claim-ready");
  return Object.freeze({
    manifestDigest,
    weightsDigest,
    authorityBasis: checkpointManifest.authorityBasis,
    trainedBiometricWeightsIncluded: checkpointManifest.trainedBiometricWeightsIncluded === true,
    biometricBackboneReady: checkpointManifest.biometricBackboneReady === true,
  });
}

export function createCheckpointBoundScoreSource({
  checkpointManifest,
  protocolDigest,
  codeCommit,
  scorerCodeDigest,
  scorerVersion,
  sourceId,
  issuedAt,
  expiresAt,
} = {}) {
  const normalizedCommit = required(codeCommit, "codeCommit");
  const checkpoint = assertCheckpoint(checkpointManifest, normalizedCommit);
  const sourceManifest = createConsentedScoreSourceManifest({
    sourceId,
    authorityBasis: "owned-checkpoint",
    protocolDigest,
    codeCommit: normalizedCommit,
    scorerCodeDigest,
    checkpointManifestDigest: checkpoint.manifestDigest,
    weightsDigest: checkpoint.weightsDigest,
    scorerVersion,
    issuedAt,
    expiresAt,
    evaluationOnly: true,
    trainingAuthorized: false,
    rawBiometricsRetained: false,
  });
  const body = Object.freeze({
    version: TRUST_FACE_CHECKPOINT_SCORE_SOURCE_BINDING_V1.version,
    sourceManifestDigest: sourceManifest.sourceManifestDigest,
    checkpointManifestDigest: checkpoint.manifestDigest,
    weightsDigest: checkpoint.weightsDigest,
    checkpointAuthorityBasis: checkpoint.authorityBasis,
    checkpointTrainedBiometricWeightsIncluded: checkpoint.trainedBiometricWeightsIncluded,
    checkpointBiometricBackboneReady: checkpoint.biometricBackboneReady,
    codeCommit: normalizedCommit,
    protocolDigest: digest(protocolDigest, "protocolDigest"),
    scorerCodeDigest: digest(scorerCodeDigest, "scorerCodeDigest"),
    scorerVersion: required(scorerVersion, "scorerVersion"),
    evaluationOnly: true,
    trainingAuthorized: false,
    originAttested: false,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
  return Object.freeze({ ...body, bindingDigest: sha256(body), sourceManifest });
}

export function assertCheckpointBoundScoreSource({
  binding,
  checkpointManifest,
  protocolDigest,
  codeCommit,
  scorerVersion,
} = {}) {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) fail("checkpoint_score_source_binding_required", "checkpoint score source binding is required");
  if (binding.version !== TRUST_FACE_CHECKPOINT_SCORE_SOURCE_BINDING_V1.version) fail("checkpoint_score_source_binding_version_mismatch", "unsupported checkpoint score source binding version");
  const normalizedCommit = required(codeCommit, "codeCommit");
  const checkpoint = assertCheckpoint(checkpointManifest, normalizedCommit);
  if (binding.checkpointManifestDigest !== checkpoint.manifestDigest) fail("checkpoint_manifest_digest_mismatch", "binding checkpoint manifest digest mismatch");
  if (binding.weightsDigest !== checkpoint.weightsDigest) fail("checkpoint_weights_digest_mismatch", "binding weights digest mismatch");
  if (binding.protocolDigest !== digest(protocolDigest, "protocolDigest")) fail("checkpoint_protocol_digest_mismatch", "binding protocol digest mismatch");
  if (binding.codeCommit !== normalizedCommit) fail("checkpoint_binding_commit_mismatch", "binding codeCommit mismatch");
  if (binding.scorerVersion !== required(scorerVersion, "scorerVersion")) fail("checkpoint_scorer_version_mismatch", "binding scorerVersion mismatch");
  if (binding.sourceManifest?.checkpointManifestDigest !== checkpoint.manifestDigest) fail("source_checkpoint_digest_mismatch", "source manifest checkpoint digest mismatch");
  if (binding.sourceManifest?.weightsDigest !== checkpoint.weightsDigest) fail("source_weights_digest_mismatch", "source manifest weights digest mismatch");
  const body = Object.freeze({
    version: binding.version,
    sourceManifestDigest: binding.sourceManifestDigest,
    checkpointManifestDigest: binding.checkpointManifestDigest,
    weightsDigest: binding.weightsDigest,
    checkpointAuthorityBasis: binding.checkpointAuthorityBasis,
    checkpointTrainedBiometricWeightsIncluded: binding.checkpointTrainedBiometricWeightsIncluded,
    checkpointBiometricBackboneReady: binding.checkpointBiometricBackboneReady,
    codeCommit: binding.codeCommit,
    protocolDigest: binding.protocolDigest,
    scorerCodeDigest: binding.scorerCodeDigest,
    scorerVersion: binding.scorerVersion,
    evaluationOnly: true,
    trainingAuthorized: false,
    originAttested: false,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
  const expected = sha256(body);
  if (binding.bindingDigest !== expected) fail("checkpoint_score_source_binding_digest_mismatch", "binding digest mismatch");
  return Object.freeze({
    valid: true,
    bindingDigest: expected,
    sourceManifestDigest: binding.sourceManifestDigest,
    checkpointManifestDigest: checkpoint.manifestDigest,
    weightsDigest: checkpoint.weightsDigest,
    checkpointAuthorityBasis: checkpoint.authorityBasis,
    trainedBiometricWeightsIncluded: checkpoint.trainedBiometricWeightsIncluded,
    biometricBackboneReady: checkpoint.biometricBackboneReady,
    originAttested: false,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
