import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1,
  createConsentedScoreBatchEvidence,
  digestConsentedScoreBatch,
  assertConsentedScoreBatchEvidence,
} from "../src/consented-score-batch-evidence-v1.mjs";
import { createConsentedScoreSourceManifest } from "../src/consented-score-source-manifest-v1.mjs";

const digest = (char) => `sha256:${char.repeat(64)}`;
const commit = "71a1fb983a1b23c90005125ee8ffb3ae9182a1c1";
const scorerVersion = "trust-face-owned-scorer/v1";
const scores = Object.freeze([
  Object.freeze({ pairId: "genuine:a1::a2", score: 0.92 }),
  Object.freeze({ pairId: "impostor:a1::b2", score: 0.31 }),
]);

function sourceManifest(overrides = {}) {
  return createConsentedScoreSourceManifest({
    sourceId: "owned-checkpoint-eval-001",
    protocolDigest: digest("a"),
    codeCommit: commit,
    scorerCodeDigest: digest("d"),
    checkpointManifestDigest: digest("e"),
    weightsDigest: digest("f"),
    scorerVersion,
    issuedAt: "2026-08-31T10:00:00Z",
    expiresAt: "2026-08-31T14:00:00Z",
    ...overrides,
  });
}

function evidence(overrides = {}) {
  return createConsentedScoreBatchEvidence({
    scores,
    protocolDigest: digest("a"),
    codeCommit: commit,
    authorizationDigest: digest("b"),
    consentLedgerDigest: digest("c"),
    scorerVersion,
    scoreSourceManifest: sourceManifest(),
    capturedAt: "2026-08-31T11:30:00Z",
    ...overrides,
  });
}

test("score evidence profile is fail-closed for storage, training and source provenance", () => {
  assert.equal(TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1.scoreSourceManifestRequired, true);
  assert.equal(TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1.rawBiometricPayloadAccepted, false);
  assert.equal(TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1.rawEmbeddingAccepted, false);
  assert.equal(TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1.trainingAuthorized, false);
  assert.equal(TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1.productionReady, false);
});

test("score batch digest is deterministic and order-insensitive by pairId", () => {
  const reversed = [...scores].reverse();
  assert.equal(digestConsentedScoreBatch(scores), digestConsentedScoreBatch(reversed));
});

test("score evidence binds score set, authorization and owned score source", () => {
  const item = evidence();
  const checked = assertConsentedScoreBatchEvidence({
    evidence: item,
    scores,
    protocolDigest: digest("a"),
    codeCommit: commit,
    authorizationDigest: digest("b"),
    scoreSourceManifest: sourceManifest(),
  });

  assert.equal(checked.valid, true);
  assert.equal(checked.evidenceDigest, item.evidenceDigest);
  assert.equal(checked.scoreSetDigest, item.scoreSetDigest);
  assert.equal(checked.consentLedgerDigest, digest("c"));
  assert.equal(checked.scoreSourceManifestDigest, item.scoreSourceManifestDigest);
  assert.equal(checked.scoreSourceId, "owned-checkpoint-eval-001");
  assert.equal(checked.checkpointManifestDigest, digest("e"));
  assert.equal(checked.weightsDigest, digest("f"));
  assert.equal(checked.provenanceClass, "declared-consented-score-batch-with-owned-source");
  assert.equal(checked.scoreSourceOriginAttested, false);
  assert.equal(checked.productionReady, false);
  assert.equal(checked.biometricClaimReady, false);
});

test("score evidence creation requires an active owned score source manifest", () => {
  assert.throws(
    () => evidence({ scoreSourceManifest: undefined }),
    (error) => error?.code === "score_source_manifest_required",
  );
  assert.throws(
    () => evidence({ scoreSourceManifest: sourceManifest({ authorityBasis: "external-provider" }) }),
    (error) => error?.code === "score_source_manifest_invalid",
  );
});

test("score evidence rejects source manifest drift", () => {
  const item = evidence();
  const otherSource = sourceManifest({ weightsDigest: digest("9") });
  assert.throws(
    () => assertConsentedScoreBatchEvidence({
      evidence: item,
      scores,
      protocolDigest: digest("a"),
      codeCommit: commit,
      authorizationDigest: digest("b"),
      scoreSourceManifest: otherSource,
    }),
    (error) => error?.code === "score_source_manifest_digest_mismatch",
  );
});

test("score evidence rejects raw biometric fields", () => {
  assert.throws(
    () => createConsentedScoreBatchEvidence({
      scores: [{ pairId: "genuine:a1::a2", score: 0.92, image: "forbidden" }],
      protocolDigest: digest("a"),
      codeCommit: commit,
      authorizationDigest: digest("b"),
      consentLedgerDigest: digest("c"),
      scorerVersion,
      scoreSourceManifest: sourceManifest(),
      capturedAt: "2026-08-31T11:30:00Z",
    }),
    (error) => error?.code === "raw_biometric_payload_forbidden",
  );
});

test("score evidence cannot authorize training or raw biometric retention", () => {
  assert.throws(
    () => evidence({ trainingUsed: true }),
    (error) => error?.code === "training_use_forbidden",
  );

  assert.throws(
    () => evidence({ rawBiometricsRetained: true }),
    (error) => error?.code === "raw_biometrics_retention_forbidden",
  );
});
