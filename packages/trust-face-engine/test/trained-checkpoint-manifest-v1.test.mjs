
import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_TRAINED_CHECKPOINT_MANIFEST_V1,
  createTrainedCheckpointManifest,
} from "../src/trained-checkpoint-manifest-v1.mjs";

const digest = (char) => `sha256:${char.repeat(64)}`;

test("profile remains non-production by default", () => {
  assert.equal(TRUST_FACE_TRAINED_CHECKPOINT_MANIFEST_V1.requiredEmbeddingDim, 512);
  assert.equal(TRUST_FACE_TRAINED_CHECKPOINT_MANIFEST_V1.trainedBiometricWeightsIncludedByDefault, false);
  assert.equal(TRUST_FACE_TRAINED_CHECKPOINT_MANIFEST_V1.productionReadyByDefault, false);
});

test("synthetic checkpoint can be described without claiming biometric weights", () => {
  const manifest = createTrainedCheckpointManifest({
    checkpointId: "synthetic-001",
    codeCommit: "ef1b38e6022e802b26eb22fe94b973031dd791c7",
    runSpecDigest: digest("a"),
    datasetManifestDigest: digest("b"),
    authorityBasis: "synthetic",
    embeddingDim: 512,
    trainingCompleted: true,
    weightsDigest: digest("c"),
  });

  assert.equal(manifest.trainedBiometricWeightsIncluded, false);
  assert.equal(manifest.biometricBackboneReady, false);
  assert.equal(manifest.productionReady, false);
  assert.match(manifest.manifestDigest, /^sha256:[0-9a-f]{64}$/);
});

test("consented training is blocked without explicit authorization", () => {
  assert.throws(
    () =>
      createTrainedCheckpointManifest({
        checkpointId: "real-001",
        codeCommit: "ef1b38e6022e802b26eb22fe94b973031dd791c7",
        runSpecDigest: digest("d"),
        datasetManifestDigest: digest("e"),
        authorityBasis: "consented-training",
        authorizationId: "auth-001",
        trainingCompleted: true,
        weightsDigest: digest("f"),
        realBiometricTrainingAuthorized: false,
      }),
    (error) => error?.code === "real_biometric_training_not_authorized",
  );
});

test("authorized completed training still requires evaluation before backbone-ready", () => {
  const manifest = createTrainedCheckpointManifest({
    checkpointId: "real-002",
    codeCommit: "ef1b38e6022e802b26eb22fe94b973031dd791c7",
    runSpecDigest: digest("1"),
    datasetManifestDigest: digest("2"),
    authorityBasis: "consented-training",
    authorizationId: "auth-002",
    trainingCompleted: true,
    weightsDigest: digest("3"),
    evaluationCompleted: false,
    realBiometricTrainingAuthorized: true,
  });

  assert.equal(manifest.trainedBiometricWeightsIncluded, true);
  assert.equal(manifest.biometricBackboneReady, false);
  assert.equal(manifest.productionReady, false);
});

test("authorized trained and evaluated checkpoint becomes backbone-ready but not production-ready", () => {
  const manifest = createTrainedCheckpointManifest({
    checkpointId: "real-003",
    codeCommit: "ef1b38e6022e802b26eb22fe94b973031dd791c7",
    runSpecDigest: digest("4"),
    datasetManifestDigest: digest("5"),
    authorityBasis: "consented-training",
    authorizationId: "auth-003",
    trainingCompleted: true,
    weightsDigest: digest("6"),
    evaluationCompleted: true,
    evaluationDigest: digest("7"),
    realBiometricTrainingAuthorized: true,
  });

  assert.equal(manifest.trainedBiometricWeightsIncluded, true);
  assert.equal(manifest.biometricBackboneReady, true);
  assert.equal(manifest.productionReady, false);
  assert.equal(manifest.biometricClaimReady, false);
});
