import assert from "node:assert/strict";
import test from "node:test";

import { createTrainEvalRunSpec } from "../src/train-eval-run-spec-v1.mjs";
import {
  TRUST_FACE_RUN_SPEC_SYNTHETIC_EVALUATION_V1,
  executeSyntheticTrainAndEvaluationFromRunSpec,
} from "../src/run-spec-synthetic-evaluation-v1.mjs";

const digest = (char) => `sha256:${char.repeat(64)}`;

function runSpec() {
  return createTrainEvalRunSpec({
    runId: "synthetic-cycle-001",
    codeCommit: "bf913f628b37e8115ad0eb01a435bae583e2d006",
    datasetManifestDigest: digest("a"),
    authorityBasis: "synthetic",
    seed: 20260831,
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

test("profile explicitly remains synthetic and non-production", () => {
  assert.equal(TRUST_FACE_RUN_SPEC_SYNTHETIC_EVALUATION_V1.acceptedAuthorityBasis, "synthetic");
  assert.equal(TRUST_FACE_RUN_SPEC_SYNTHETIC_EVALUATION_V1.trainingExecuted, true);
  assert.equal(TRUST_FACE_RUN_SPEC_SYNTHETIC_EVALUATION_V1.evaluationExecuted, true);
  assert.equal(TRUST_FACE_RUN_SPEC_SYNTHETIC_EVALUATION_V1.trainedBiometricWeightsIncluded, false);
  assert.equal(TRUST_FACE_RUN_SPEC_SYNTHETIC_EVALUATION_V1.realMetricsReady, false);
  assert.equal(TRUST_FACE_RUN_SPEC_SYNTHETIC_EVALUATION_V1.productionReady, false);
});

test("run spec drives deterministic synthetic train and evaluation", () => {
  const spec = runSpec();
  const a = executeSyntheticTrainAndEvaluationFromRunSpec({
    runSpec: spec,
    identities: 4,
    samplesPerIdentity: 4,
  });
  const b = executeSyntheticTrainAndEvaluationFromRunSpec({
    runSpec: spec,
    identities: 4,
    samplesPerIdentity: 4,
  });

  assert.deepEqual(a, b);
  assert.equal(a.runSpecDigest, spec.digest);
  assert.equal(a.datasetManifestDigest, spec.datasetManifestDigest);
  assert.equal(a.codeCommit, spec.codeCommit);
  assert.equal(a.seed, spec.seed);
  assert.equal(a.authorityBasis, "synthetic");
  assert.equal(a.trainingExecuted, true);
  assert.equal(a.evaluationExecuted, true);
  assert.equal(a.trainedBiometricWeightsIncluded, false);
  assert.equal(a.realMetricsReady, false);
  assert.equal(a.productionReady, false);
  assert.equal(a.biometricClaimReady, false);
  assert.equal(a.pairCount, 8);
  assert.equal(a.operatingPoints.length, spec.evaluation.thresholds.length);
  assert.match(a.checkpointDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(a.evaluationDigest, /^sha256:[0-9a-f]{64}$/);
  assert.ok(Number.isFinite(a.approximateEerPoint.fmr));
  assert.ok(Number.isFinite(a.approximateEerPoint.fnmr));
});

test("non-synthetic authority is blocked before evaluation", () => {
  const spec = { ...runSpec(), authorityBasis: "consented-training" };
  assert.throws(
    () => executeSyntheticTrainAndEvaluationFromRunSpec({ runSpec: spec }),
    (error) => error?.code === "non_synthetic_evaluation_blocked",
  );
});

test("pre-executed run specs are rejected", () => {
  const spec = { ...runSpec(), evaluationExecuted: true };
  assert.throws(
    () => executeSyntheticTrainAndEvaluationFromRunSpec({ runSpec: spec }),
    (error) => error?.code === "invalid_run_spec_execution_state",
  );
});
