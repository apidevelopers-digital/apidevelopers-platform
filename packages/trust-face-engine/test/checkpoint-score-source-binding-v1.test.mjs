import assert from "node:assert/strict";
import test from "node:test";

import { createTrainedCheckpointManifest } from "../src/trained-checkpoint-manifest-v1.mjs";
import {
  TRUST_FACE_CHECKPOINT_SCORE_SOURCE_BINDING_V1,
  createCheckpointBoundScoreSource,
  assertCheckpointBoundScoreSource,
} from "../src/checkpoint-score-source-binding-v1.mjs";

const d = (char) => `sha256:${char.repeat(64)}`;
const commit = "5b0b9d40aa30b25c3e0666fabc106100f721502a";

function checkpoint(overrides = {}) {
  return createTrainedCheckpointManifest({
    checkpointId: "synthetic-owned-checkpoint-001",
    codeCommit: commit,
    runSpecDigest: d("a"),
    datasetManifestDigest: d("b"),
    authorityBasis: "synthetic",
    trainingCompleted: true,
    evaluationCompleted: true,
    weightsDigest: d("c"),
    evaluationDigest: d("d"),
    ...overrides,
  });
}

function binding(cp = checkpoint(), overrides = {}) {
  return createCheckpointBoundScoreSource({
    checkpointManifest: cp,
    protocolDigest: d("e"),
    codeCommit: commit,
    scorerCodeDigest: d("f"),
    scorerVersion: "trust-face-owned-scorer/v1",
    sourceId: "owned-checkpoint-source-001",
    issuedAt: "2026-08-31T15:00:00Z",
    expiresAt: "2026-08-31T18:00:00Z",
    ...overrides,
  });
}

test("profile preserves non-production and non-claim state", () => {
  assert.equal(TRUST_FACE_CHECKPOINT_SCORE_SOURCE_BINDING_V1.originAttested, false);
  assert.equal(TRUST_FACE_CHECKPOINT_SCORE_SOURCE_BINDING_V1.realMetricsReady, false);
  assert.equal(TRUST_FACE_CHECKPOINT_SCORE_SOURCE_BINDING_V1.productionReady, false);
  assert.equal(TRUST_FACE_CHECKPOINT_SCORE_SOURCE_BINDING_V1.biometricClaimReady, false);
});

test("binding deterministically connects checkpoint manifest and score source", () => {
  const cp = checkpoint();
  const a = binding(cp);
  const b = binding(cp);
  assert.deepEqual(a, b);
  assert.equal(a.checkpointManifestDigest, cp.manifestDigest);
  assert.equal(a.weightsDigest, cp.weightsDigest);
  assert.equal(a.sourceManifest.checkpointManifestDigest, cp.manifestDigest);
  assert.equal(a.sourceManifest.weightsDigest, cp.weightsDigest);
  assert.equal(a.checkpointAuthorityBasis, "synthetic");
  assert.equal(a.checkpointTrainedBiometricWeightsIncluded, false);
  assert.equal(a.checkpointBiometricBackboneReady, false);
  assert.equal(a.originAttested, false);
  assert.equal(a.realMetricsReady, false);
});

test("assertion validates exact checkpoint, commit, protocol and scorer", () => {
  const cp = checkpoint();
  const item = binding(cp);
  const checked = assertCheckpointBoundScoreSource({
    binding: item,
    checkpointManifest: cp,
    protocolDigest: d("e"),
    codeCommit: commit,
    scorerVersion: "trust-face-owned-scorer/v1",
  });
  assert.equal(checked.valid, true);
  assert.equal(checked.bindingDigest, item.bindingDigest);
  assert.equal(checked.checkpointManifestDigest, cp.manifestDigest);
  assert.equal(checked.weightsDigest, cp.weightsDigest);
});

test("binding rejects incomplete checkpoint state", () => {
  assert.throws(
    () => binding(checkpoint({ trainingCompleted: false, weightsDigest: null })),
    (error) => ["invalid_binding_field", "checkpoint_training_incomplete"].includes(error?.code),
  );
  assert.throws(
    () => binding(checkpoint({ evaluationCompleted: false, evaluationDigest: null })),
    (error) => error?.code === "checkpoint_evaluation_incomplete",
  );
});

test("assertion rejects checkpoint drift", () => {
  const cp = checkpoint();
  const item = binding(cp);
  const drifted = checkpoint({ weightsDigest: d("9") });
  assert.throws(
    () => assertCheckpointBoundScoreSource({
      binding: item,
      checkpointManifest: drifted,
      protocolDigest: d("e"),
      codeCommit: commit,
      scorerVersion: "trust-face-owned-scorer/v1",
    }),
    (error) => ["checkpoint_manifest_digest_mismatch", "checkpoint_weights_digest_mismatch"].includes(error?.code),
  );
});

test("assertion rejects protocol, commit and scorer drift", () => {
  const cp = checkpoint();
  const item = binding(cp);
  assert.throws(
    () => assertCheckpointBoundScoreSource({ binding: item, checkpointManifest: cp, protocolDigest: d("9"), codeCommit: commit, scorerVersion: "trust-face-owned-scorer/v1" }),
    (error) => error?.code === "checkpoint_protocol_digest_mismatch",
  );
  assert.throws(
    () => assertCheckpointBoundScoreSource({ binding: item, checkpointManifest: cp, protocolDigest: d("e"), codeCommit: "1111111111111111111111111111111111111111", scorerVersion: "trust-face-owned-scorer/v1" }),
    (error) => error?.code === "checkpoint_commit_mismatch",
  );
  assert.throws(
    () => assertCheckpointBoundScoreSource({ binding: item, checkpointManifest: cp, protocolDigest: d("e"), codeCommit: commit, scorerVersion: "different-scorer" }),
    (error) => error?.code === "checkpoint_scorer_version_mismatch",
  );
});

test("binding rejects unsupported checkpoint authority", () => {
  const cp = { ...checkpoint(), authorityBasis: "external-provider" };
  assert.throws(() => binding(cp), (error) => error?.code === "checkpoint_authority_mismatch");
});
