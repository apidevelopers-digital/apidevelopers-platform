import { createHash } from "node:crypto";
import { makeSyntheticIdentityBatch } from "./deep-training-lab.mjs";
import { executeSyntheticTrainingFromRunSpec } from "./run-spec-synthetic-executor-v1.mjs";
import { evaluateVerification, trainMetricModel } from "./metric-lab.mjs";

export const TRUST_FACE_RUN_SPEC_SYNTHETIC_EVALUATION_V1 = Object.freeze({
  version: "trust-face-run-spec-synthetic-evaluation/v1",
  acceptedAuthorityBasis: "synthetic",
  trainingExecuted: true,
  evaluationExecuted: true,
  trainedBiometricWeightsIncluded: false,
  realMetricsReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceRunSpecSyntheticEvaluationV1Error";
  error.code = code;
  throw error;
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

function buildMetricSamples(batch) {
  return batch.samples.map((sample, index) => Object.freeze({
    subjectId: `synthetic-subject-${sample.classIndex}`,
    vector: sample.vector,
    sampleId: `synthetic-${index}`,
  }));
}

function buildVerificationPairs(batch) {
  const byClass = new Map();
  for (const sample of batch.samples) {
    const list = byClass.get(sample.classIndex) ?? [];
    list.push(sample.vector);
    byClass.set(sample.classIndex, list);
  }

  const classes = [...byClass.keys()].sort((a, b) => a - b);
  const pairs = [];
  for (const classIndex of classes) {
    const vectors = byClass.get(classIndex);
    pairs.push(Object.freeze({
      sameSubject: true,
      referenceVector: vectors[0],
      probeVector: vectors[1],
    }));
  }
  for (let i = 0; i < classes.length; i += 1) {
    const a = byClass.get(classes[i])[0];
    const b = byClass.get(classes[(i + 1) % classes.length])[0];
    pairs.push(Object.freeze({
      sameSubject: false,
      referenceVector: a,
      probeVector: b,
    }));
  }
  return Object.freeze(pairs);
}

export function executeSyntheticTrainAndEvaluationFromRunSpec({
  runSpec,
  identities = 4,
  samplesPerIdentity = 4,
} = {}) {
  if (!runSpec || typeof runSpec !== "object") fail("invalid_run_spec", "runSpec is required");
  if (runSpec.authorityBasis !== "synthetic") {
    fail("non_synthetic_evaluation_blocked", "this evaluator accepts only authorityBasis=synthetic");
  }
  if (runSpec.trainingExecuted !== false || runSpec.evaluationExecuted !== false) {
    fail("invalid_run_spec_execution_state", "input runSpec must be unexecuted");
  }

  const training = executeSyntheticTrainingFromRunSpec({
    runSpec,
    identities,
    samplesPerIdentity,
  });

  const batch = makeSyntheticIdentityBatch({
    identities,
    samplesPerIdentity,
    embeddingDim: runSpec.backboneTopology.embeddingDim,
    seed: runSpec.seed,
  });

  const metricModel = trainMetricModel({
    samples: buildMetricSamples(batch),
    modelVersion: "trust-face-metric/synthetic-run-spec-v1",
  });

  const verification = evaluateVerification({
    model: metricModel,
    pairs: buildVerificationPairs(batch),
    thresholds: runSpec.evaluation.thresholds,
  });

  const evaluationDigest = sha256({
    runSpecDigest: runSpec.digest,
    checkpointDigest: training.checkpointDigest,
    metricModelVersion: verification.modelVersion,
    operatingPoints: verification.operatingPoints,
    approximateEerPoint: verification.approximateEerPoint,
  });

  return Object.freeze({
    evaluatorVersion: TRUST_FACE_RUN_SPEC_SYNTHETIC_EVALUATION_V1.version,
    runId: runSpec.runId,
    runSpecDigest: runSpec.digest,
    datasetManifestDigest: runSpec.datasetManifestDigest,
    codeCommit: runSpec.codeCommit,
    seed: runSpec.seed,
    authorityBasis: "synthetic",
    checkpointDigest: training.checkpointDigest,
    evaluationDigest,
    pairCount: verification.pairCount,
    operatingPoints: verification.operatingPoints,
    approximateEerPoint: verification.approximateEerPoint,
    trainingExecuted: true,
    evaluationExecuted: true,
    trainedBiometricWeightsIncluded: false,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
