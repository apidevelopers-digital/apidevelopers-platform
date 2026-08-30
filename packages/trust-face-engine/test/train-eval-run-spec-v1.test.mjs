import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_TRAIN_EVAL_RUN_SPEC_V1,
  createTrainEvalRunSpec,
} from "../src/train-eval-run-spec-v1.mjs";

const digest = (char) => `sha256:${char.repeat(64)}`;

function syntheticSpec() {
  return createTrainEvalRunSpec({
    runId: "synthetic-run-001",
    codeCommit: "d3abbdc67772ab29a8ccf3b1c98001e8f2575655",
    datasetManifestDigest: digest("a"),
    authorityBasis: "synthetic",
    seed: 12345,
    training: {
      epochs: 12,
      batchSize: 32,
      learningRate: 0.001,
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

test("profile binds canonical topology and remains non-production", () => {
  assert.deepEqual(TRUST_FACE_TRAIN_EVAL_RUN_SPEC_V1.stageWidths, [64, 96, 160, 256]);
  assert.deepEqual(TRUST_FACE_TRAIN_EVAL_RUN_SPEC_V1.stageDepths, [1, 2, 3, 2]);
  assert.equal(TRUST_FACE_TRAIN_EVAL_RUN_SPEC_V1.blockCount, 8);
  assert.equal(TRUST_FACE_TRAIN_EVAL_RUN_SPEC_V1.embeddingDim, 512);
  assert.equal(TRUST_FACE_TRAIN_EVAL_RUN_SPEC_V1.trainingExecuted, false);
  assert.equal(TRUST_FACE_TRAIN_EVAL_RUN_SPEC_V1.productionReady, false);
});

test("run spec is deterministic and binds dataset, code, seed, hyperparameters and evaluation", () => {
  const a = syntheticSpec();
  const b = syntheticSpec();
  assert.deepEqual(a, b);
  assert.match(a.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a.datasetManifestDigest, digest("a"));
  assert.equal(a.seed, 12345);
  assert.equal(a.training.epochs, 12);
  assert.deepEqual(a.evaluation.metricSet, ["fmr", "fnmr", "approximate-eer"]);
  assert.equal(a.trainingExecuted, false);
  assert.equal(a.evaluationExecuted, false);
  assert.equal(a.realMetricsReady, false);
});

test("consented-training requires an explicit authorization id", () => {
  assert.throws(
    () => createTrainEvalRunSpec({
      runId: "real-run-001",
      codeCommit: "d3abbdc67772ab29a8ccf3b1c98001e8f2575655",
      datasetManifestDigest: digest("b"),
      authorityBasis: "consented-training",
      seed: 7,
    }),
    (error) => error?.code === "missing_training_authorization_id",
  );
});

test("consented-training can be specified without executing training", () => {
  const spec = createTrainEvalRunSpec({
    runId: "real-run-002",
    codeCommit: "d3abbdc67772ab29a8ccf3b1c98001e8f2575655",
    datasetManifestDigest: digest("c"),
    authorityBasis: "consented-training",
    authorizationId: "authorization-placeholder-001",
    seed: 11,
  });

  assert.equal(spec.authorityBasis, "consented-training");
  assert.equal(spec.authorizationId, "authorization-placeholder-001");
  assert.equal(spec.trainingExecuted, false);
  assert.equal(spec.trainedBiometricWeightsIncluded, false);
  assert.equal(spec.realMetricsReady, false);
});

test("invalid threshold or hyperparameter ranges are rejected", () => {
  assert.throws(
    () => createTrainEvalRunSpec({
      runId: "bad-threshold",
      codeCommit: "d3abbdc67772ab29a8ccf3b1c98001e8f2575655",
      datasetManifestDigest: digest("d"),
      authorityBasis: "synthetic",
      seed: 1,
      evaluation: { thresholds: [0.5, 2] },
    }),
    (error) => error?.code === "invalid_thresholds",
  );

  assert.throws(
    () => createTrainEvalRunSpec({
      runId: "bad-epochs",
      codeCommit: "d3abbdc67772ab29a8ccf3b1c98001e8f2575655",
      datasetManifestDigest: digest("e"),
      authorityBasis: "synthetic",
      seed: 1,
      training: { epochs: 0 },
    }),
    (error) => error?.code === "invalid_hyperparameter",
  );
});
