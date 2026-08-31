import assert from "node:assert/strict";
import test from "node:test";
import {
  TRUST_FACE_CONSENTED_SCORE_SOURCE_MANIFEST_V1 as PROFILE,
  createConsentedScoreSourceManifest as create,
  assertConsentedScoreSourceManifest as verify,
} from "../src/consented-score-source-manifest-v1.mjs";

const d = (c) => `sha256:${c.repeat(64)}`;
const commit = "d15a8da90e8e4c97ceff9076fe49712a25cd8aed";
const make = (overrides = {}) => create({
  sourceId: "owned-checkpoint-eval-001",
  protocolDigest: d("a"),
  codeCommit: commit,
  scorerCodeDigest: d("b"),
  checkpointManifestDigest: d("c"),
  weightsDigest: d("d"),
  scorerVersion: "trust-face-owned-scorer/v1",
  issuedAt: "2026-08-31T15:00:00Z",
  expiresAt: "2026-08-31T18:00:00Z",
  ...overrides,
});

test("profile is declaration-only and non-production", () => {
  assert.equal(PROFILE.authorityBasisRequired, "owned-checkpoint");
  assert.equal(PROFILE.evaluationOnly, true);
  assert.equal(PROFILE.trainingAuthorized, false);
  assert.equal(PROFILE.rawBiometricsRetained, false);
  assert.equal(PROFILE.originAttested, false);
  assert.equal(PROFILE.realMetricsReady, false);
  assert.equal(PROFILE.productionReady, false);
  assert.equal(PROFILE.biometricClaimReady, false);
});

test("manifest is deterministic and binds owned scorer provenance", () => {
  const item = make();
  assert.deepEqual(item, make());
  const checked = verify({
    manifest: item,
    protocolDigest: d("a"),
    codeCommit: commit,
    scorerVersion: "trust-face-owned-scorer/v1",
    now: "2026-08-31T16:00:00Z",
  });
  assert.equal(checked.valid, true);
  assert.equal(checked.sourceManifestDigest, item.sourceManifestDigest);
  assert.equal(checked.checkpointManifestDigest, d("c"));
  assert.equal(checked.weightsDigest, d("d"));
  assert.equal(checked.originAttested, false);
  assert.equal(checked.realMetricsReady, false);
});

test("creation is fail-closed for authority, geometry, training and raw retention", () => {
  for (const [input, code] of [
    [{ authorityBasis: "external-provider" }, "score_source_authority_mismatch"],
    [{ embeddingDim: 256 }, "score_source_embedding_dim_mismatch"],
    [{ similarityMetric: "euclidean" }, "score_source_metric_mismatch"],
    [{ normalization: "none" }, "score_source_normalization_mismatch"],
    [{ trainingAuthorized: true }, "score_source_training_forbidden"],
    [{ rawBiometricsRetained: true }, "score_source_raw_retention_forbidden"],
  ]) {
    assert.throws(() => make(input), (error) => error?.code === code);
  }
});

test("activation window is fail-closed", () => {
  assert.throws(() => make({ expiresAt: "2026-08-31T14:59:59Z" }), (error) => error?.code === "score_source_invalid_window");
  assert.throws(
    () => verify({ manifest: make(), protocolDigest: d("a"), codeCommit: commit, scorerVersion: "trust-face-owned-scorer/v1", now: "2026-08-31T18:00:00Z" }),
    (error) => error?.code === "score_source_not_active",
  );
});

test("verification rejects protocol, commit and scorer drift", () => {
  const item = make();
  for (const [protocolDigest, codeCommit, scorerVersion, code] of [
    [d("e"), commit, "trust-face-owned-scorer/v1", "score_source_protocol_mismatch"],
    [d("a"), "different-commit", "trust-face-owned-scorer/v1", "score_source_commit_mismatch"],
    [d("a"), commit, "different-scorer", "score_source_scorer_version_mismatch"],
  ]) {
    assert.throws(
      () => verify({ manifest: item, protocolDigest, codeCommit, scorerVersion, now: "2026-08-31T16:00:00Z" }),
      (error) => error?.code === code,
    );
  }
});

test("verification rejects manifest tampering", () => {
  const item = { ...make(), weightsDigest: d("f") };
  assert.throws(
    () => verify({ manifest: item, protocolDigest: d("a"), codeCommit: commit, scorerVersion: "trust-face-owned-scorer/v1", now: "2026-08-31T16:00:00Z" }),
    (error) => error?.code === "score_source_manifest_digest_mismatch",
  );
});
