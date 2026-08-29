
import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_DEEP_TRAINING_LAB_PROFILE,
  createDeepTrainingRunSpec,
  makeSyntheticIdentityBatch,
  runAngularMarginSmokeTraining,
} from "../src/deep-training-lab.mjs";

const digest = `sha256:${"a".repeat(64)}`;

test("training lab keeps real biometric training blocked without separate approval", () => {
  assert.equal(TRUST_FACE_DEEP_TRAINING_LAB_PROFILE.realBiometricTrainingAuthorized, false);
  assert.throws(
    () => createDeepTrainingRunSpec({
      runId: "real-training",
      datasetManifestDigest: digest,
      authorityBasis: "consented-training",
      codeCommit: "abcdef123456",
      seed: 42,
    }),
    (error) => error?.code === "consented_training_requires_separate_approval",
  );
});

test("run spec is deterministic and audit-bound", () => {
  const input = {
    runId: "synthetic-smoke-001",
    datasetManifestDigest: digest,
    authorityBasis: "synthetic",
    codeCommit: "abcdef123456",
    seed: 42,
    epochs: 3,
  };
  const a = createDeepTrainingRunSpec(input);
  const b = createDeepTrainingRunSpec(input);
  assert.equal(a.digest, b.digest);
  assert.equal(a.backboneWeightsTrained, false);
  assert.equal(a.productionReady, false);
});

test("synthetic batch is deterministic for a fixed seed", () => {
  const a = makeSyntheticIdentityBatch({ identities: 3, samplesPerIdentity: 3, embeddingDim: 128, seed: 9 });
  const b = makeSyntheticIdentityBatch({ identities: 3, samplesPerIdentity: 3, embeddingDim: 128, seed: 9 });
  assert.deepEqual(a, b);
});

test("angular margin smoke training is reproducible and sanitized", () => {
  const runSpec = createDeepTrainingRunSpec({
    runId: "synthetic-smoke-002",
    datasetManifestDigest: digest,
    authorityBasis: "synthetic",
    codeCommit: "abcdef123456",
    seed: 7,
    epochs: 4,
    embeddingDim: 128,
    scale: 16,
    marginRadians: 0.2,
  });
  const batch = makeSyntheticIdentityBatch({
    identities: 4,
    samplesPerIdentity: 4,
    embeddingDim: 128,
    seed: 7,
  });
  const a = runAngularMarginSmokeTraining({ runSpec, batch, learningRate: 0.04 });
  const b = runAngularMarginSmokeTraining({ runSpec, batch, learningRate: 0.04 });

  assert.deepEqual(a, b);
  assert.ok(a.checkpointDigest.startsWith("sha256:"));
  assert.equal(a.sampleCount, 16);
  assert.equal(a.identityCount, 4);
  assert.equal(a.backboneWeightsTrained, false);
  assert.equal(a.productionReady, false);
  assert.equal("weights" in a, false);
  assert.equal("vectors" in a, false);
});
