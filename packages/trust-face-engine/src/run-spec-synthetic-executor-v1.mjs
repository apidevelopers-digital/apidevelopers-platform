import {
  createDeepTrainingRunSpec,
  makeSyntheticIdentityBatch,
  runAngularMarginSmokeTraining,
} from "./deep-training-lab.mjs";

export const TRUST_FACE_RUN_SPEC_SYNTHETIC_EXECUTOR_V1 = Object.freeze({
  version: "trust-face-run-spec-synthetic-executor/v1",
  acceptedAuthorityBasis: "synthetic",
  trainingExecuted: true,
  evaluationExecuted: false,
  trainedBiometricWeightsIncluded: false,
  realMetricsReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceRunSpecSyntheticExecutorV1Error";
  error.code = code;
  throw error;
}

export function executeSyntheticTrainingFromRunSpec({
  runSpec,
  identities = 4,
  samplesPerIdentity = 4,
} = {}) {
  if (!runSpec || typeof runSpec !== "object") {
    fail("invalid_run_spec", "runSpec is required");
  }
  if (runSpec.authorityBasis !== "synthetic") {
    fail(
      "non_synthetic_training_blocked",
      "this executor accepts only authorityBasis=synthetic",
    );
  }
  if (runSpec.trainingExecuted !== false || runSpec.evaluationExecuted !== false) {
    fail(
      "invalid_run_spec_execution_state",
      "input runSpec must enter with trainingExecuted=false and evaluationExecuted=false",
    );
  }
  if (
    !runSpec.backboneTopology ||
    runSpec.backboneTopology.embeddingDim !== 512 ||
    runSpec.backboneTopology.blockCount !== 8
  ) {
    fail("invalid_canonical_topology", "runSpec must bind the canonical 8-block 512D topology");
  }

  const deepRunSpec = createDeepTrainingRunSpec({
    runId: runSpec.runId,
    datasetManifestDigest: runSpec.datasetManifestDigest,
    authorityBasis: "synthetic",
    codeCommit: runSpec.codeCommit,
    seed: runSpec.seed,
    epochs: runSpec.training.epochs,
    embeddingDim: runSpec.backboneTopology.embeddingDim,
    scale: runSpec.training.scale,
    marginRadians: runSpec.training.marginRadians,
    qualityAware: runSpec.training.qualityAware,
  });

  const batch = makeSyntheticIdentityBatch({
    identities,
    samplesPerIdentity,
    embeddingDim: runSpec.backboneTopology.embeddingDim,
    seed: runSpec.seed,
  });

  const training = runAngularMarginSmokeTraining({
    runSpec: deepRunSpec,
    batch,
    learningRate: runSpec.training.learningRate,
  });

  return Object.freeze({
    executorVersion: TRUST_FACE_RUN_SPEC_SYNTHETIC_EXECUTOR_V1.version,
    runId: runSpec.runId,
    runSpecDigest: runSpec.digest,
    deepRunSpecDigest: deepRunSpec.digest,
    datasetManifestDigest: runSpec.datasetManifestDigest,
    codeCommit: runSpec.codeCommit,
    seed: runSpec.seed,
    authorityBasis: runSpec.authorityBasis,
    checkpointDigest: training.checkpointDigest,
    initialLoss: training.initialLoss,
    finalLoss: training.finalLoss,
    lossImproved: training.lossImproved,
    sampleCount: training.sampleCount,
    identityCount: training.identityCount,
    trainingExecuted: true,
    evaluationExecuted: false,
    trainedBiometricWeightsIncluded: false,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
