import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1,
  evaluateConsented1to1Scores,
} from "../src/consented-1to1-evaluator-v1.mjs";
import {
  createConsentedRealEvaluationAuthorization,
} from "../src/consented-real-eval-auth-gate-v1.mjs";
import {
  createConsentedScoreBatchEvidence,
} from "../src/consented-score-batch-evidence-v1.mjs";

const digest = (char) => `sha256:${char.repeat(64)}`;
const commit = "299502d0bbbe225670e7304c30009b3bd36cd65c";

function protocol() {
  return Object.freeze({
    protocolDigest: digest("a"),
    authorityBasis: "consented-lab",
    realMetricsReady: false,
    pairs: Object.freeze([
      Object.freeze({ pairId: "genuine:a1::a2", sameSubject: true }),
      Object.freeze({ pairId: "genuine:b1::b2", sameSubject: true }),
      Object.freeze({ pairId: "impostor:a1::b2", sameSubject: false }),
      Object.freeze({ pairId: "impostor:b1::a2", sameSubject: false }),
    ]),
  });
}

function authorization() {
  return createConsentedRealEvaluationAuthorization({
    authorizationId: "eval-auth-binding-001",
    scope: "face-1to1-evaluation",
    protocolDigest: digest("a"),
    codeCommit: commit,
    issuedAt: "2026-08-31T10:00:00Z",
    expiresAt: "2026-08-31T14:00:00Z",
    evaluationOnly: true,
    trainingAuthorized: false,
    realBiometricEvaluationAuthorized: true,
  });
}

const syntheticScores = Object.freeze([
  Object.freeze({ pairId: "genuine:a1::a2", score: 0.92 }),
  Object.freeze({ pairId: "genuine:b1::b2", score: 0.88 }),
  Object.freeze({ pairId: "impostor:a1::b2", score: 0.31 }),
  Object.freeze({ pairId: "impostor:b1::a2", score: 0.27 }),
]);

function scoreEvidence(auth = authorization(), scores = syntheticScores) {
  return createConsentedScoreBatchEvidence({
    scores,
    protocolDigest: digest("a"),
    codeCommit: commit,
    authorizationDigest: auth.authorizationDigest,
    consentLedgerDigest: digest("c"),
    scorerVersion: "trust-face-score-source/lab-v1",
    capturedAt: "2026-08-31T11:30:00Z",
    rawBiometricsRetained: false,
    trainingUsed: false,
  });
}

test("evaluator profile remains non-production and metadata-only", () => {
  assert.equal(TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1.rawBiometricPayloadAccepted, false);
  assert.equal(TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1.rawEmbeddingAccepted, false);
  assert.equal(TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1.productionReady, false);
  assert.equal(TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1.biometricClaimReady, false);
});

test("synthetic score adapter produces deterministic FMR/FNMR operating points", () => {
  const a = evaluateConsented1to1Scores({
    protocol: protocol(),
    scores: syntheticScores,
    threshlds: [0.3, 0.5, 0.7, 0.9],
  });
  const b = evaluateConsented1to1Scores({
    protocol: protocol(),
    scores: syntheticScores,
    thresholds: [0.3, 0.5, 0.7, 0.9],
  });

  assert.deepEqual(a, b);
  assert.equal(a.executionMode, "synthetic");
  assert.equal(a.realMetricsReady, false);
  assert.equal(a.authorizationId, null);
  assert.equal(a.scoreEvidenceDigest, null);
  assert.equal(a.scoreProvenanceClass, "synthetic");
  assert.equal(a.pairCount, 4);
  assert.ok(a.operatingPoints.every((point) => Number.isFinite(point.fmr) && Number.isFinite(point.fnmr)));
});

test("consented-real mode cannot be unlocked by the legacy boolean alone", () => {
  assert.throws(
    () => evaluateConsented1to1Scores({
      protocol: protocol(),
      scores: syntheticScores,
      execution: {
        mode: "consented-real",
        realBiometricExecutionAuthorized: true,
        codeCommit: commit,
        now: "2026-08-31T12:00:00Z",
      },
    }),
    (error) => error?.code === "authorization_required",
  );
});

test("consented-real mode requires score evidence after authorization passes", () => {
  const auth = authorization();
  assert.throws(
    () => evaluateConsented1to1Scores({
      protocol: protocol(),
      scores: syntheticScores,
      execution: {
        mode: "consented-real",
        authorization: auth,
        codeCommit: commit,
        now: "2026-08-31T12:00:00Z",
      },
    }),
    (error) => error?.code === "score_evidence_required",
  );
});

test("consented-real mode binds authorization and score evidence but does not auto-claim real metrics", () => {
  const auth = authorization();
  const result = evaluateConsented1to1Scores({
    protocol: protocol(),
    scores: syntheticScores,
    execution: {
      mode: "consented-real",
      authorization: auth,
      scoreEvidence: scoreEvidence(auth),
      codeCommit: commit,
      now: "2026-08-31T12:00:00Z",
    },
  });

  assert.equal(result.executionMode, "consented-real");
  assert.equal(result.consentedRealExecutionAuthorized, true);
  assert.equal(result.scoreEvidenceBound, true);
  assert.equal(result.realMetricsReady, false);
  assert.equal(result.authorizationId, "eval-auth-binding-001");
  assert.match(result.authorizationDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(result.scoreEvidenceDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(result.scoreSetDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.consentLedgerDigest, digest("c"));
  assert.equal(result.scoreProvenanceClass, "declared-consented-score-batch");
  assert.equal(result.codeCommit, commit);
});

test("consented-real mode rejects evidence for a different score batch", () => {
  const auth = authorization();
  const changedScores = syntheticScores.map((item) => ({ ...item }));
  changedScores[0].score = 0.91;

  assert.throws(
    () => evaluateConsented1to1Scores({
      protocol: protocol(),
      scores: changedScores,
      execution: {
        mode: "consented-real",
        authorization: auth,
        scoreEvidence: scoreEvidence(auth),
        codeCommit: commit,
        now: "2026-08-31T12:00:00Z",
      },
    }),
    (error) => error?.code === "score_set_digest_mismatch",
  );
});

test("consented-real mode rejects authorization bound to a different commit", () => {
  assert.throws(
    () => evaluateConsented1to1Scores({
      protocol: protocol(),
      scores: syntheticScores,
      execution: {
        mode: "consented-real",
        authorization: authorization(),
        scoreEvidence: scoreEvidence(),
        codeCommit: "different-commit",
        now: "2026-08-31T12:00:00Z",
      },
    }),
    (error) => error?.code === "code_commit_mismatch",
  );
});

test("executor rejects raw embeddings or biometric payloads", () => {
  const scores = syntheticScores.map((item) => ({ ...item }));
  scores[0].embedding = [1, 0, 0];
  assert.throws(
    () => evaluateConsented1to1Scores({ protocol: protocol(), scores }),
    (error) => error?.code === "raw_biometric_payload_forbidden",
  );
});

test("executor requires exact protocol score coverage", () => {
  assert.throws(
    () => evaluateConsented1to1Scores({ protocol: protocol(), scores: syntheticScores.slice(0, 3) }),
    (error) => error?.code === "score_coverage_mismatch",
  );
});
