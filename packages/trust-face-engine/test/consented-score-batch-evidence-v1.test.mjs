import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1,
  createConsentedScoreBatchEvidence,
  digestConsentedScoreBatch,
  assertConsentedScoreBatchEvidence,
} from "../src/consented-score-batch-evidence-v1.mjs";

const digest = (char) => `sha256:${char.repeat(64)}`;
const scores = Object.freeze([
  Object.freeze({ pairId: "genuine:a1::a2", score: 0.92 }),
  Object.freeze({ pairId: "impostor:a1::b2", score: 0.31 }),
]);

function evidence() {
  return createConsentedScoreBatchEvidence({
    scores,
    protocolDigest: digest("a"),
    codeCommit: "299502d0bbbe225670e7304c30009b3bd36cd65c",
    authorizationDigest: digest("b"),
    consentLedgerDigest: digest("c"),
    scorerVersion: "trust-face-score-source/lab-v1",
    capturedAt: "2026-08-31T11:30:00Z",
  });
}

test("score evidence profile is fail-closed for storage and training", () => {
  assert.equal(TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1.rawBiometricPayloadAccepted, false);
  assert.equal(TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1.rawEmbeddingAccepted, false);
  assert.equal(TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1.trainingAuthorized, false);
  assert.equal(TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1.productionReady, false);
});

test("score batch digest is deterministic and order-insensitive by pairId", () => {
  const reversed = [...scores].reverse();
  assert.equal(digestConsentedScoreBatch(scores), digestConsentedScoreBatch(reversed));
});

test("score evidence binds score set, protocol, commit and authorization", () => {
  const item = evidence();
  const checked = assertConsentedScoreBatchEvidence({
    evidence: item,
    scores,
    protocolDigest: digest("a"),
    codeCommit: "299502d0bbbe225670e7304c30009b3bd36cd65c",
    authorizationDigest: digest("b"),
  });

  assert.equal(checked.valid, true);
  assert.equal(checked.evidenceDigest, item.evidenceDigest);
  assert.equal(checked.scoreSetDigest, item.scoreSetDigest);
  assert.equal(checked.consentLedgerDigest, digest("c"));
  assert.equal(checked.provenanceClass, "declared-consented-score-batch");
  assert.equal(checked.productionReady, false);
  assert.equal(checked.biometricClaimReady, false);
});

test("score evidence rejects raw biometric fields", () => {
  assert.throws(
    () => createConsentedScoreBatchEvidence({
      scores: [{ pairId: "genuine:a1::a2", score: 0.92, image: "forbidden" }],
      protocolDigest: digest("a"),
      codeCommit: "299502d0bbbe225670e7304c30009b3bd36cd65c",
      authorizationDigest: digest("b"),
      consentLedgerDigest: digest("c"),
      scorerVersion: "trust-face-score-source/lab-v1",
      capturedAt: "2026-08-31T11:30:00Z",
    }),
    (error) => error?.code === "raw_biometric_payload_forbidden",
  );
});

test("score evidence cannot authorize training or raw biometric retention", () => {
  assert.throws(
    () => createConsentedScoreBatchEvidence({
      scores,
      protocolDigest: digest("a"),
      codeCommit: "299502d0bbbe225670e7304c30009b3bd36cd65c",
      authorizationDigest: digest("b"),
      consentLedgerDigest: digest("c"),
      scorerVersion: "trust-face-score-source/lab-v1",
      capturedAt: "2026-08-31T11:30:00Z",
      trainingUsed: true,
    }),
    (error) => error?.code === "training_use_forbidden",
  );

  assert.throws(
    () => createConsentedScoreBatchEvidence({
      scores,
      protocolDigest: digest("a"),
      codeCommit: "299502d0bbbe225670e7304c30009b3bd36cd65c",
      authorizationDigest: digest("b"),
      consentLedgerDigest: digest("c"),
      scorerVersion: "trust-face-score-source/lab-v1",
      capturedAt: "2026-08-31T11:30:00Z",
      rawBiometricsRetained: true,
    }),
    (error) => error?.code === "raw_biometrics_retention_forbidden",
  );
});
