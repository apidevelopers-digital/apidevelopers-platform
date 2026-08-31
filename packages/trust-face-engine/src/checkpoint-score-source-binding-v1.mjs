import { createHash } from "node:crypto";
import {
  createConsentedScoreSourceManifest,
  assertConsentedScoreSourceManifest,
} from "./consented-score-source-manifest-v1.mjs";
import { createTrainedCheckpointManifest } from "./trained-checkpoint-manifest-v1.mjs";

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

  let canonical;
  try {
    canonical = createTrainedCheckpointManifest({
      checkpointId: checkpointManifest.checkpointId,
      codeCommit: checkpointManifest.codeCommit,
      runSpecDigest: checkpointManifest.runSpecDigest,
      datasetManifestDigest: checkpointManifest.datasetManifestDigest,
      authorityBasis: checkpointManifest.authorityBasis,
      authorizationId: checkpointManifest.authorizationId,
      embeddingDim: checkpointManifest.embeddingDim,
      backboneTopology: checkpointManifest.backboneTopology,
      weightsDigest: checkpointManifest.weightsDigest,
      trainingCompleted: checkpointManifest.trainingCompleted,
      evaluationCompleted: checkpointManifest.evaluationCompleted,
      evaluationDigest: checkpointManifest.evaluationDigest,
      realBiometricTrainingAuthorized:
        checkpointManifest.authorityBasis === "consented-training" &&
        checkpointManifest.trainedBiometricWeightsIncluded === true,
    });
  } catch (error) {
    fail("checkpoint_manifest_invalid", `trained checkpoint manifest is invalid: ${error?.code ?? error?.message ?? "unknown error"}`);
  }

  if (canonical.manifestDigest !== manifestDigest) fail("checkpoint_manifest_digest_mismatch", "checkpoint manifest digest does not match canonical checkpoint contents");
  if (canonical.weightsDigest !== weightsDigest) fail("checkpoint_weights_digest_mismatch", "checkpoint weights digest does not match canonical checkpoint contents");
  if (checkpointManifest.trainedBiometricWeightsIncluded !== canonical.trainedBiometricWeightsIncluded) fail("checkpoint_trained_weights_state_mismatch", "checkpoint trained biometric weights state mismatch");
  if (checkpointManifest.biometricBackboneReady !== canonical.biometricBackboneReady) fail("checkpoint_backbone_state_mismatch", "checkpoint biometric backbone state mismatch");

  return Object.freeze({
    manifestDigest: canonical.manifestDigest,
    weightsDigest: canonical.weightsDigest,
    authorityBasis: canonical.authorityBasis,
    trainedBiometricWeightsIncluded: canonical.trainedBiometricWeightsIncluded,
    biometricBackboneReady: canonical.biometricBackboneReady,
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
    codeCommit: sourceManifest.codeCommit,
    protocolDigest: sourceManifest.protocolDigest,
    scorerCodeDigest: sourceManifest.scorerCodeDigest,
    scorerVersion: sourceManifest.scorerVersion,
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
  scorerCodeDigest,
  scorerVersion,
  now,
} = {}) {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) fail("checkpoint_score_source_binding_required", "checkpoint score source binding is required");
  if (binding.version !== TRUST_FACE_CHECKPOINT_SCORE_SOURCE_BINDING_V1.version) fail("checkpoint_score_source_binding_version_mismatch", "unsupported checkpoint score source binding version");
  if (
    binding.evaluationOnly !== true ||
    binding.trainingAuthorized !== false ||
    binding.originAttested !== false ||
    binding.realMetricsReady !== false ||
    binding.productionReady !== false ||
    binding.biometricClaimReady !== false
  ) {
    fail("checkpoint_score_source_binding_policy_mismatch", "checkpoint score source binding policy state mismatch");
  }
  if (
    !binding.sourceManifest ||
    typeof binding.sourceManifest !== "object" ||
    Array.isArray(binding.sourceManifest)
  ) {
    fail("source_manifest_required", "binding source manifest is required");
  }
  if (
    binding.sourceManifest.provenanceClass !== "declared-owned-score-source" ||
    binding.sourceManifest.originAttested !== false ||
    binding.sourceManifest.realMetricsReady !== false ||
    binding.sourceManifest.productionReady !== false ||
    binding.sourceManifest.biometricClaimReady !== false
  ) {
    fail("source_manifest_claim_state_mismatch", "source manifest must remain declared, unattested, non-production and non-claim-ready");
  }

  const normalizedCommit = required(codeCommit, "codeCommit");
  const expectedProtocolDigest = digest(protocolDigest, "protocolDigest");
  const expectedScorerCodeDigest = digest(scorerCodeDigest, "scorerCodeDigest");
  const expectedScorerVersion = required(scorerVersion, "scorerVersion");
  const checkpoint = assertCheckpoint(checkpointManifest, normalizedCommit);

  if (binding.checkpointManifestDigest !== checkpoint.manifestDigest) fail("checkpoint_manifest_digest_mismatch", "binding checkpoint manifest digest mismatch");
  if (binding.weightsDigest !== checkpoint.weightsDigest) fail("checkpoint_weights_digest_mismatch", "binding weights digest mismatch");
  if (binding.checkpointAuthorityBasis !== checkpoint.authorityBasis) fail("checkpoint_authority_binding_mismatch", "binding checkpoint authorityBasis mismatch");
  if (binding.checkpointTrainedBiometricWeightsIncluded !== checkpoint.trainedBiometricWeightsIncluded) fail("checkpoint_trained_weights_binding_mismatch", "binding trained biometric weights state mismatch");
  if (binding.checkpointBiometricBackboneReady !== checkpoint.biometricBackboneReady) fail("checkpoint_backbone_binding_mismatch", "binding biometric backbone state mismatch");
  if (binding.protocolDigest !== expectedProtocolDigest) fail("checkpoint_protocol_digest_mismatch", "binding protocol digest mismatch");
  if (binding.codeCommit !== normalizedCommit) fail("checkpoint_binding_commit_mismatch", "binding codeCommit mismatch");
  if (binding.scorerCodeDigest !== expectedScorerCodeDigest) fail("checkpoint_scorer_code_digest_mismatch", "binding scorerCodeDigest mismatch");
  if (binding.scorerVersion !== expectedScorerVersion) fail("checkpoint_scorer_version_mismatch", "binding scorerVersion mismatch");

  const source = assertConsentedScoreSourceManifest({
    manifest: binding.sourceManifest,
    protocolDigest: expectedProtocolDigest,
    codeCommit: normalizedCommit,
    scorerVersion: expectedScorerVersion,
    now,
  });
  if (binding.sourceManifestDigest !== source.sourceManifestDigest) fail("source_manifest_digest_mismatch", "binding source manifest digest mismatch");
  if (source.checkpointManifestDigest !== checkpoint.manifestDigest) fail("source_checkpoint_digest_mismatch", "source manifest checkpoint digest mismatch");
  if (source.weightsDigest !== checkpoint.weightsDigest) fail("source_weights_digest_mismatch", "source manifest weights digest mismatch");
  if (source.scorerCodeDigest !== expectedScorerCodeDigest) fail("source_scorer_code_digest_mismatch", "source manifest scorerCodeDigest mismatch");

  const body = Object.freeze({
    version: binding.version,
    sourceManifestDigest: source.sourceManifestDigest,
    checkpointManifestDigest: checkpoint.manifestDigest,
    weightsDigest: checkpoint.weightsDigest,
    checkpointAuthorityBasis: checkpoint.authorityBasis,
    checkpointTrainedBiometricWeightsIncluded: checkpoint.trainedBiometricWeightsIncluded,
    checkpointBiometricBackboneReady: checkpoint.biometricBackboneReady,
    codeCommit: normalizedCommit,
    protocolDigest: expectedProtocolDigest,
    scorerCodeDigest: expectedScorerCodeDigest,
    scorerVersion: expectedScorerVersion,
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
    sourceManifestDigest: source.sourceManifestDigest,
    checkpointManifestDigest: checkpoint.manifestDigest,
    weightsDigest: checkpoint.weightsDigest,
    checkpointAuthorityBasis: checkpoint.authorityBasis,
    trainedBiometricWeightsIncluded: checkpoint.trainedBiometricWeightsIncluded,
    biometricBackboneReady: checkpoint.biometricBackboneReady,
    scorerCodeDigest: expectedScorerCodeDigest,
    originAttested: false,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
