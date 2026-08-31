import assert from "node:assert/strict";
import test from "node:test";

import { createConsentedScoreSourceManifest } from "../src/consented-score-source-manifest-v1.mjs";
import { createConsentedScoreBatchEvidence } from "../src/consented-score-batch-evidence-v1.mjs";
import { createConsentedScoreGenerationReceipt } from "../src/consented-score-generation-receipt-v1.mjs";
import {
  TRUST_FACE_SCORE_GENERATION_EVIDENCE_BINDING_V1 as PROFILE,
  createScoreGenerationEvidenceBinding,
  assertScoreGenerationEvidenceBinding,
} from "../src/score-generation-evidence-binding-v1.mjs";

const d = (char) => `sha256:${char.repeat(64)}`;
const codeCommit = "194b7f0544a13079ceaf103d288dd0fc20199c39";
const protocolDigest = d("a");
const authorizationDigest = d("b");
const consentLedgerDigest = d("c");
const scorerCodeDigest = d("d");
const checkpointManifestDigest = d("e");
const weightsDigest = d("f");
const scorerVersion = "trust-face-owned-scorer/v1";
const scores = Object.freeze([
  Object.freeze({ pairId: "pair-001", score: 0.82 }),
  Object.freeze({ pairId: "pair-002", score: -0.14 }),
]);

function source(overrides = {}) {
  return createConsentedScoreSourceManifest({
    sourceId: "owned-checkpoint-source-001",
    authorityBasis: "owned-checkpoint",
    protocolDigest,
    codeCommit,
    scorerCodeDigest,
    checkpointManifestDigest,
    weightsDigest,
    scorerVersion,
    issuedAt: "2026-08-31T15:00:00Z",
    expiresAt: "2026-08-31T18:00:00Z",
    ...overrides,
  });
}

function evidence(sourceManifest = source(), overrides = {}) {
  return createConsentedScoreBatchEvidence({
    scores,
    protocolDigest,
    codeCommit,
    authorizationDigest,
    consentLedgerDigest,
    scorerVersion,
    scoreSourceManifest: sourceManifest,
    capturedAt: "2026-08-31T16:05:00Z",
    ...overrides,
  });
}

function receipt(scoreEvidence = evidence(), overrides = {}) {
  return createConsentedScoreGenerationReceipt({
    generationId: "score-generation-001",
    protocolDigest,
    codeCommit,
    authorizationDigest,
    consentLedgerDigest,
    scoreSourceManifestDigest: scoreEvidence.scoreSourceManifestDigest,
    checkpointManifestDigest: scoreEvidence.checkpointManifestDigest,
    weightsDigest: scoreEvidence.weightsDigest,
    scorerCodeDigest: scoreEvidence.scorerCodeDigest,
    scorerVersion,
    scoreSetDigest: scoreEvidence.scoreSetDigest,
    pairCount: scores.length,
    startedAt: "2026-08-31T16:00:00Z",
    completedAt: "2026-08-31T16:04:00Z",
    ...overrides,
  });
}

function bindingInput(overrides = {}) {
  const scoreSourceManifest = overrides.scoreSourceManifest ?? source();
  const scoreEvidence = overrides.scoreEvidence ?? evidence(scoreSourceManifest);
  const generationReceipt = overrides.generationReceipt ?? receipt(scoreEvidence);
  return {
    generationReceipt,
    scoreEvidence,
    scores,
    scoreSourceManifest,
    protocolDigest,
    codeCommit,
    authorizationDigest,
    consentLedgerDigest,
    scorerVersion,
    now: "2026-08-31T16:10:00Z",
    ...overrides,
  };
}

test("profile remains evaluation-only and non-production", () => {
  assert.equal(PROFILE.evaluationOnly, true);
  assert.equal(PROFILE.trainingAuthorized, false);
  assert.equal(PROFILE.rawBiometricPayloadAccepted, false);
  assert.equal(PROFILE.rawEmbeddingAccepted, false);
  assert.equal(PROFILE.originAttested, false);
  assert.equal(PROFILE.realMetricsReady, false);
  assert.equal(PROFILE.productionReady, false);
  assert.equal(PROFILE.biometricClaimReady, false);
});

test("binding deterministically connects generation receipt to exact score evidence", () => {
  const input = bindingInput();
  const a = createScoreGenerationEvidenceBinding(input);
  const b = createScoreGenerationEvidenceBinding(input);
  assert.deepEqual(a, b);
  assert.equal(a.generationReceiptDigest, input.generationReceipt.generationReceiptDigest);
  assert.equal(a.scoreEvidenceDigest, input.scoreEvidence.evidenceDigest);
  assert.equal(a.scoreSetDigest, input.scoreEvidence.scoreSetDigest);
  assert.equal(a.pairCount, scores.length);
  assert.equal(a.scoreSourceManifestDigest, input.scoreEvidence.scoreSourceManifestDigest);
  assert.equal(a.checkpointManifestDigest, input.scoreEvidence.checkpointManifestDigest);
  assert.equal(a.weightsDigest, input.scoreEvidence.weightsDigest);
  assert.equal(a.scorerCodeDigest, input.scoreEvidence.scorerCodeDigest);
  assert.equal(a.originAttested, false);
  assert.equal(a.realMetricsReady, false);
});

test("assertion validates exact receipt/evidence linkage", () => {
  const input = bindingInput();
  const binding = createScoreGenerationEvidenceBinding(input);
  const checked = assertScoreGenerationEvidenceBinding({ binding, ...input });
  assert.equal(checked.valid, true);
  assert.equal(checked.bindingDigest, binding.bindingDigest);
  assert.equal(checked.generationReceiptDigest, input.generationReceipt.generationReceiptDigest);
  assert.equal(checked.scoreEvidenceDigest, input.scoreEvidence.evidenceDigest);
});

test("binding rejects a valid receipt for a different score set", () => {
  const input = bindingInput();
  const differentReceipt = receipt(input.scoreEvidence, { scoreSetDigest: d("9") });
  assert.throws(
    () => createScoreGenerationEvidenceBinding({ ...input, generationReceipt: differentReceipt }),
    (error) => error?.code === "generation_scoreSetDigest_mismatch",
  );
});

test("binding rejects consent ledger drift", () => {
  const input = bindingInput();
  assert.throws(
    () => createScoreGenerationEvidenceBinding({ ...input, consentLedgerDigest: d("9") }),
    (error) => error?.code === "generation_evidence_consent_ledger_digest_mismatch",
  );
});

test("binding rejects source/checkpoint drift", () => {
  const input = bindingInput();
  const driftedSource = source({ checkpointManifestDigest: d("8"), weightsDigest: d("7") });
  assert.throws(
    () => createScoreGenerationEvidenceBinding({ ...input, scoreSourceManifest: driftedSource }),
    (error) =>
      [
        "score_source_manifest_digest_mismatch",
        "score_source_checkpoint_digest_mismatch",
        "score_source_weights_digest_mismatch",
        "score_source_manifest_invalid",
      ].includes(error?.code),
  );
});

test("binding rejects receipt completion after evidence capture", () => {
  const scoreSourceManifest = source();
  const scoreEvidence = evidence(scoreSourceManifest, { capturedAt: "2026-08-31T16:03:00Z" });
  const generationReceipt = receipt(scoreEvidence, {
    startedAt: "2026-08-31T16:00:00Z",
    completedAt: "2026-08-31T16:04:00Z",
  });
  assert.throws(
    () =>
      createScoreGenerationEvidenceBinding({
        generationReceipt,
        scoreEvidence,
        scores,
        scoreSourceManifest,
        protocolDigest,
        codeCommit,
        authorizationDigest,
        consentLedgerDigest,
        scorerVersion,
        now: "2026-08-31T16:10:00Z",
      }),
    (error) => error?.code === "generation_evidence_time_order_mismatch",
  );
});

test("assertion fails closed on binding policy and digest tampering", () => {
  const input = bindingInput();
  const item = createScoreGenerationEvidenceBinding(input);

  assert.throws(
    () => assertScoreGenerationEvidenceBinding({ binding: { ...item, productionReady: true }, ...input }),
    (error) => error?.code === "generation_evidence_binding_policy_mismatch",
  );

  assert.throws(
    () =>
      assertScoreGenerationEvidenceBinding({
        binding: { ...item, bindingDigest: d("9") },
        ...input,
      }),
    (error) => error?.code === "generation_evidence_binding_digest_mismatch",
  );
});
