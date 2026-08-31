import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CONSENTED_SCORE_GENERATION_RECEIPT_V1 as PROFILE,
  createConsentedScoreGenerationReceipt as create,
  assertConsentedScoreGenerationReceipt as verify,
} from "../src/consented-score-generation-receipt-v1.mjs";

const d = (char) => `sha256:${char.repeat(64)}`;
const commit = "5b0b9d40aa30b25c3e0666fabc106100f721502a";

function receipt(overrides = {}) {
  return create({
    generationId: "score-generation-001",
    protocolDigest: d("a"),
    codeCommit: commit,
    authorizationDigest: d("b"),
    consentLedgerDigest: d("c"),
    scoreSourceManifestDigest: d("d"),
    checkpointManifestDigest: d("e"),
    weightsDigest: d("f"),
    scorerCodeDigest: d("1"),
    scorerVersion: "trust-face-owned-scorer/v1",
    scoreSetDigest: d("2"),
    pairCount: 128,
    startedAt: "2026-08-31T16:00:00Z",
    completedAt: "2026-08-31T16:03:00Z",
    ...overrides,
  });
}

function expected(overrides = {}) {
  return {
    protocolDigest: d("a"),
    codeCommit: commit,
    authorizationDigest: d("b"),
    consentLedgerDigest: d("c"),
    scoreSourceManifestDigest: d("d"),
    checkpointManifestDigest: digest("e"),
    weightsDigest: d("f"),
    scorerCodeDigest: d("1"),
    scorerVersion: "trust-face-owned-scorer/v1",
    scoreSetDigest: d("2"),
    pairCount: 128,
    now: "2026-08-31T16:10:00Z",
    ...overrides,
  };
}

test("profile remains declaration-only and non-production", () => {
  assert.equal(PROFILE.evaluationOnly, true);
  assert.equal(PROFILE.trainingUsed, false);
  assert.equal(PROFILE.rawBiometricsRetained, false);
  assert.equal(PROFILE.rawEmbeddingsRetained, false);
  assert.equal(PROFILE.originAttested, false);
  assert.equal(PROFILE.realMetricsReady, false);
  assert.equal(PROFILE.productionReady, false);
  assert.equal(PROFILE.biometricClaimReady, false);
});

test("receipt is deterministic for the exact generation metadata", () => {
  const a = receipt();
  const b = receipt();
  assert.deepEqual(a, b);
  assert.match(a.generationReceiptDigest, /^sha256:[0-9a-f]{64}$/);
});

test("receipt verification binds authorization, source, checkpoint, weights, scorer and score set", () => {
  const item = receipt();
  const checked = verify({ receipt: item, ...expected() });
  assert.equal(checked.valid, true);
  assert.equal(checked.generationId, "score-generation-001");
  assert.equal(checked.generationReceiptDigest, item.generationReceiptDigest);
  assert.equal(checked.scoreSetDigest, d("2"));
  assert.equal(checked.pairCount, 128);
  assert.equal(checked.scoreSourceManifestDigest, d("d"));
  assert.equal(checked.checkpointManifestDigest, d("e"));
  assert.equal(checked.weightsDigest, d("f"));
  assert.equal(checked.scorerCodeDigest, d("1"));
  assert.equal(checked.originAttested, false);
  assert.equal(checked.realMetricsReady, false);
});

test("creation rejects training or biometric/embedding retention", () => {
  for (const [override, code] of [
    [{ evaluationOnly: false }, "generation_evaluation_only_required"],
    [{ trainingUsed: true }, "generation_training_forbidden"],
    [{ rawBiometricsRetained: true }, "generation_raw_biometrics_retention_forbidden"],
    [{ rawEmbeddingsRetained: true }, "generation_raw_embeddings_retention_forbidden"],
  ]) {
    assert.throws(() => receipt(override), (error) => error?.code === code);
  }
});

test("verification rejects score-set and source drift", () => {
  const item = receipt();
  assert.throws(
    () => verify({ receipt: item, ...expected({ scoreSetDigest: d("3") }) }),
    (error) => error?.code === "generation_scoreSetDigest_mismatch",
  );
  assert.throws(
    () => verify({ receipt: item, ...expected({ scoreSourceManifestDigest: d("4") }) }),
    (error) => error?.code === "generation_scoreSourceManifestDigest_mismatch",
  );
});

test,"verification rejects checkpoint, weights and scorer drift", () => {
  const item = receipt();
  for (const [override, code] of [
    [{ checkpointManifestDigest: d("5") }, "generation_checkpointManifestDigest_mismatch"],
    [{ weightsDigest: d("6") }, "generation_weightsDigest_mismatch"],
    [{ scorerCodeDigest: d("7") }, "generation_scorerCodeDigest_mismatch"],
    [{ scorerVersion: "different-scorer" }, "generation_scorerVersion_mismatch"],
  ]) {
    assert.throws(() => verify({ receipt: item, ...expected(override) }), (error) => error?.code === code);
  }
});

test,"verification rejects tampering and receipts completed in the future", () => {
  const tampered = { ...receipt(), pairCount: 129 };
  assert.throws(
    () => verify({ receipt: tampered, ...expected({ pairCount: 129 }) }),
    (error) => error?.code === "generation_receipt_digest_mismatch",
  );
  assert.throws(
    () => verify({ receipt: receipt(), ...expected({ now: "2026-08-31T16:02:00Z" }) }),
    (error) => error?.code === "generation_receipt_from_future",
  );
});
