import assert from "node:assert/strict";
import test from "node:test";

import { createTrainEvalRunSpec } from "../src/train-eval-run-spec-v1.mjs";
import {
  TRUST_FACE_RUN_SPEC_SYNTHETIC_EXECUTOR_V1,
  executeSyntheticTrainingFromRunSpec,
} from "../src/run-spec-synthetic-executor-v1.mjs";

const digest = (char) => `sha256:${char.repeat(64)}`;

function runSpec() {
  return createTrainEvalRunSpec({
    runId: "synthetic-executor-001",
    codeCommit: "03ad25b8ca49ba9706629a4eda6696c0ea9ba5aa",
    datasetManifestDigest: digest("a"),
    authorityBasis: "synthetic",
    seed: 20260830,
    training: {
      epochs: 3,
      batchSize: 16,
      learningRate: 0.02,
      optimizer: "adamw",
      weightDecay: 0.0001,
      scale: 64,
      marginRadians: 0.5,
      qualityAware: true,
    },
    evaluation: {
      split: "test",
      impostorRatio: 1,
      thresholds: [0.3, 0.5, 0.7, 0.9],
    },
  });
}

test("executor profile is synthetic-only and non-biometric", () => {
  assert.equal(TRUST_FACE_RUN_SPEC_SYNTHETIC_EXECUTOR_V1.acceptedAuthorityBasis, "synthetic");
  assert.equal(TRUST_FACE_RUN_SPEC_SYNTHETIC_EXECUTOR_V1.trainingExecuted, true);
  assert.equal(TRUST_FACE_RUN_SPEC_SYNTHETIC_EXECUTOR_V1.evaluationExecuted, false);
  assert.equal(TRUST_FACE_RUN_SPEC_SYNTHETIC_EXECUTOR_V1.trainedBiometricWeightsIncluded, false);
  assert.equal(TRUST_FACE_RUN_SPEC_SYNTHETIC_EXECUTOR_V1.realMetricsReady, false);
  assert.equal(TRUST_FACE_RUN_SPEC_SYNTHETIC_EXECUTOR_V1.productionReady, false);
});

test("run spec drives deterministic synthetic smoke training", () => {
  const spec = runSpec();
  const a = executeSyntheticTrainingFromRunSpec({
    runSpec: spec,
    identities: 3,
    samplesPerIdentity: 3,
  });
  const b = executeSyntheticTrainingFromRunSpec({
    runSpec: spec,
    identities: 3,
    samplesPerIdentity: 3,
  });

  assert.deepEqual(a, b);
  assert.equal(a.runSpecDigest, spec.digest);
  assert.equal(a.datasetManifestDigest, spec.datasetManifestDigest);
  assert.equal(a.codeCommit, spec.codeCommit);
  assert.equal(a.seed, spec.seed);
  assert.equal(a.authorityBasis, "synthetic");
  assert.equal(a.trainingExecuted, true);
  assert.equal(a.evaluationExecuted, false);
  assert.equal(a.trainedBiometricWeightsIncluded, false);
  assert.equal(a.realMetricsReady, false);
  assert.equal(a.sampleCount, 9);
  assert.equal(a.identityCount, 3);
  assert.match(a.checkpointDigest, /^sha256:[0-9a-f]{64}$/);
  assert.ok(Number.isFinite(a.initialLoss));
  assert.ok(Number.isFinite(a.finalLoss));
});

test("non-synthetic authority is blocked before training", () => {
  const spec = { ...runSpec(), authorityBasis: "consented-training" };
  assert.throws(
    () => executeSyntheticTrainingFromRunSpec({ runSpec: spec }),
    (error) => error?.code === "non_synthetic_training_blocked",
  );
});

test("pre-executed run specs are rejected", () => {
  const spec = { ...runSpec(), trainingExecuted: true };
  assert.throws(
    () => executeSyntheticTrainingFromRunSpec({ runSpec: spec }),
    (error) => error?.code === "invalid_run_spec_execution_state",
   );
});
