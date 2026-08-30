import { createHash } from "node:crypto";

export const TRUST_FACE_TRAIN_EVAL_RUN_SPEC_V1 = Object.freeze({
  version: "trust-face-train-eval-run-spec/v1",
  embeddingDim: 512,
  stageWidths: Object.freeze([64, 96, 160, 256]),
  stageDepths: Object.freeze([1, 2, 3, 2]),
  blockCount: 8,
  supportedAuthorityBasis: Object.freeze(["synthetic", "public-licensed", "consented-training"]),
  trainingExecuted: false,
  evaluationExecuted: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceTrainEvalRunSpecV1Error";
  error.code = code;
  throw error;
}

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_run_spec_field", `${field} is required`);
  return value.trim();
}

function requireSha256(value, field) {
  const normalized = required(value, field);
  if (!/^sha256:[0-9a-f]{64}$/i.test(normalized)) fail("invalid_digest", `${field} must be sha256:<64 hex>`);
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

function finitePositive(value, field, max = Number.POSITIVE_INFINITY) {
  if (!Number.isFinite(value) || value <= 0 || value > max) fail("invalid_hyperparameter", `${field} is out of range`);
  return value;
}

function integerRange(value, field, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail("invalid_hyperparameter", `${field} is out of range`);
  return value;
}

export function createTrainEvalRunSpec({
  runId,
  codeCommit,
  datasetManifestDigest,
  authorityBasis,
  authorizationId = null,
  seed,
  training = {},
  evaluation = {},
} = {}) {
  const normalizedRunId = required(runId, "runId");
  const normalizedCommit = required(codeCommit, "codeCommit");
  const normalizedDatasetDigest = requireSha256(datasetManifestDigest, "datasetManifestDigest");

  if (!TRUST_FACE_TRAIN_EVAL_RUN_SPEC_V1.supportedAuthorityBasis.includes(authorityBasis)) {
    fail("unsupported_authority_basis", "authorityBasis is not supported");
  }
  if (authorityBasis === "consented-training" && (typeof authorizationId !== "string" || !authorizationId.trim())) {
    fail("missing_training_authorization_id", "authorizationId is required for consented-training");
  }
  if (!Number.isInteger(seed)) fail("invalid_seed", "seed must be an integer");

  const normalizedTraining = Object.freeze({
    epochs: integerRange(training.epochs ?? 20, "training.epochs", 1, 100000),
    batchSize: integerRange(training.batchSize ?? 64, "training.batchSize", 2, 65536),
    learningRate: finitePositive(training.learningRate ?? 0.001, "training.learningRate", 1),
    optimizer: required(training.optimizer ?? "adamw", "training.optimizer"),
    weightDecay: finitePositive(training.weightDecay ?? 0.0001, "training.weightDecay", 1),
    scale: finitePositive(training.scale ?? 64, "training.scale", 1024),
    marginRadians: finitePositive(training.marginRadians ?? 0.5, "training.marginRadians", Math.PI),
    qualityAware: training.qualityAware !== false,
  });

  const thresholds = evaluation.thresholds ?? [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  if (!Array.isArray(thresholds) || thresholds.length < 2 || thresholds.some((value) => !Number.isFinite(value) || value < -1 || value > 1)) {
    fail("invalid_thresholds", "evaluation.thresholds must contain at least two finite values in [-1,1]");
  }

  const normalizedEvaluation = Object.freeze({
    split: required(evaluation.split ?? "test", "evaluation.split"),
    impostorRatio: finitePositive(evaluation.impostorRatio ?? 1, "evaluation.impostorRatio", 100),
    thresholds: Object.freeze([...thresholds]),
    metricSet: Object.freeze(["fmr", "fnmr", "approximate-eer"]),
    thresholdCalibrationRequired: true,
  });

  const body = Object.freeze({
    version: TRUST_FACE_TRAIN_EVAL_RUN_SPEC_V1.version,
    runId: normalizedRunId,
    codeCommit: normalizedCommit,
    datasetManifestDigest: normalizedDatasetDigest,
    authorityBasis,
    authorizationId: authorizationId ? authorizationId.trim() : null,
    seed,
    backboneTopology: Object.freeze({
      stageWidths: TRUST_FACE_TRAIN_EVAL_RUN_SPEC_V1.stageWidths,
      stageDepths: TRUST_FACE_TRAIN_EVAL_RUN_SPEC_V1.stageDepths,
      blockCount: TRUST_FACE_TRAIN_EVAL_RUN_SPEC_V1.blockCount,
      embeddingDim: TRUST_FACE_TRAIN_EVAL_RUN_SPEC_V1.embeddingDim,
    }),
    training: normalizedTraining,
    evaluation: normalizedEvaluation,
  });

  return Object.freeze({
    ...body,
    digest: sha256(body),
    trainingExecuted: false,
    evaluationExecuted: false,
    trainedBiometricWeightsIncluded: false,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
