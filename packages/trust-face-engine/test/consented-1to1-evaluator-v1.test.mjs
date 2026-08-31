import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1,
  evaluateConsented1to1Scores,
} from "../src/consented-1to1-evaluator-v1.mjs";
import { createConsentedRealEvaluationAuthorization } from "../src/consented-real-eval-auth-gate-v1.mjs";
import { createConsentedScoreBatchEvidence } from "../src/consented-score-batch-evidence-v1.mjs";
import { createConsentedScoreSourceManifest } from "../src/consented-score-source-manifest-v1.mjs";

const digest = (char) => `sha256:${char.repeat(64)}`;
const commit = "71a1fb983a1b23c90005125ee8ffb3ae9182a1c1";
const scorerVersion = "trust-face-owned-scorer/v1";

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

const scores = Object.freeze([
  Object.freeze({ pairId: "genuine:a1::a2", score: 0.92 }),
  Object.freeze({ pairId: "genuine:b1::b2", score: 0.88 }),
  Object.freeze({ pairId: "impostor:a1::b2", score: 0.31 }),
  Object.freeze({ pairId: "impostor:b1::a2", score: 0.27 }),
]);

function scoreSourceManifest(overrides = {}) {
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

function scoreEvidence(auth = authorization(), source = scoreSourceManifest(), batch = scores) {
  return createConsentedScoreBatchEvidence({
    scores: batch,
    protocolDigest: digest("a"),
    codeCommit: commit,
    authorizationDigest: auth.authorizationDigest,
    consentLedgerDigest: digest("c"),
    scorerVersion,
    scoreSourceManifest: source,
    capturedAt: "2026-08-31T11:30:00Z",
  });
}

test("evaluator remains metadata-only and non-production", () => {
  assert.equal(TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1.rawBiometricPayloadAccepted, false);
  assert.equal(TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1.rawEmbeddingAccepted, false);
  assert.equal(TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1.productionReady, false);
  assert.equal(TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1.biometricClaimReady, false);
});

test("synthetic mode remains deterministic and non-real", () => {
  const input = { protocol: protocol(), scores, thresholds: [0.3, 0.5, 0.7, 0.9] };
  const a = evaluateConsented1to1Scores(input);
  const b = evaluateConsented1to1Scores(input);

  assert.deepEqual(a, b);
  assert.equal(a.executionMode, "synthetic");
  assert.equal(a.realMetricsReady, false);
  assert.equal(a.authorizationId, null);
  assert.equal(a.scoreEvidenceDigest, null);
  assert.equal(a.scoreSourceManifestDigest, null);
  assert.equal(a.scoreSourceId, null);
  assert.equal(a.scoreSourceOriginAttested, false);
  assert.equal(a.scoreSourceBound, false);
  assert.equal(a.scoreProvenanceClass, "synthetic");
  assert.equal(a.pairCount, 4);
});

test("legacy boolean cannot unlock consented-real mode", () => {
  assert.throws(
    () => evaluateConsented1to1Scores({
      protocol: protocol(),
      scores,
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

test("authorization and score evidence without score source manifest cannot unlock consented-real mode", () => {
  const auth = authorization();
  const source = scoreSourceManifest();
  const evidence = scoreEvidence(auth, source);
  assert.throws(
    () => evaluateConsented1to1Scores({
      protocol: protocol(),
      scores,
      execution: {
        mode: "consented-real",
        authorization: auth,
        scoreEvidence: evidence,
        codeCommit: commit,
        now: "2026-08-31T12:00:00Z",
      },
    }),
    (error) => error?.code === "score_source_manifest_required",
  );
});

test("valid source-bound evidence is accepted without claiming real biometric metrics", () => {
  const auth = authorization();
  const source = scoreSourceManifest();
  const result = evaluateConsented1to1Scores({
    protocol: protocol(),
    scores,
    execution: {
      mode: "consented-real",
      authorization: auth,
      scoreEvidence: scoreEvidence(auth, source),
      scoreSourceManifest: source,
      codeCommit: commit,
      now: "2026-08-31T12:00:00Z",
    },
  });

  assert.equal(result.consentedRealExecutionAuthorized, true);
  assert.equal(result.scoreEvidenceBound, true);
  assert.equal(result.scoreSourceBound, true);
  assert.equal(result.realMetricsReady, false);
  assert.equal(result.authorizationId, "eval-auth-binding-001");
  assert.match(result.authorizationDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(result.scoreEvidenceDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(result.scoreSetDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(result.scoreSourceManifestDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.scoreSourceId, "owned-checkpoint-eval-001");
  assert.equal(result.scoreSourceOriginAttested, false);
  assert.equal(result.consentLedgerDigest, digest("c"));
  assert.equal(result.scoreProvenanceClass, "declared-consented-score-batch-with-owned-source");
  assert.equal(result.codeCommit, commit);
  assert.equal(result.productionReady, false);
  assert.equal(result.biometricClaimReady, false);
});

test("evidence for a different score batch is rejected", () => {
  const auth = authorization();
  const source = scoreSourceManifest();
  const changed = scores.map((item) => ({ ...item }));
  changed[0].score = 0.91;

  assert.throws(
    () => evaluateConsented1to1Scores({
      protocol: protocol(),
      scores: changed,
      execution: {
        mode: "consented-real",
        authorization: auth,
        scoreEvidence: scoreEvidence(auth, source),
        scoreSourceManifest: source,
        codeCommit: commit,
        now: "2026-08-31T12:00:00Z",
      },
    }),
    (error) => error?.code === "score_set_digest_mismatch",
  );
});

test("source manifest drift is rejected", () => {
  const auth = authorization();
  const source = scoreSourceManifest();
  const otherSource = scoreSourceManifest({ weightsDigest: digest("9") });

  assert.throws(
    () => evaluateConsented1to1Scores({
      protocol: protocol(),
      scores,
      execution: {
        mode: "consented-real",
        authorization: auth,
        scoreEvidence: scoreEvidence(auth, source),
        scoreSourceManifest: otherSource,
        codeCommit: commit,
        now: "2026-08-31T12:00:00Z",
      },
    }),
    (error) => error?.code === "score_source_manifest_digest_mismatch",
  );
});

test("authorization bound to a different commit is rejected", () => {
  assert.throws(
    () => evaluateConsented1to1Scores({
      protocol: protocol(),
      scores,
      execution: {
        mode: "consented-real",
        authorization: authorization(),
        scoreEvidence: scoreEvidence(),
        scoreSourceManifest: scoreSourceManifest(),
        codeCommit: "different-commit",
        now: "2026-08-31T12:00:00Z",
      },
    }),
    (error) => error?.code === "code_commit_mismatch",
  );
});

test("raw biometric payloads and incomplete score coverage are rejected", () => {
  const raw = scores.map((item) => ({ ...item }));
  raw[0].embedding = [1, 0, 0];
  assert.throws(
    () => evaluateConsented1to1Scores({ protocol: protocol(), scores: raw }),
    (error) => error?.code === "raw_biometric_payload_forbidden",
  );
  assert.throws(
    () => evaluateConsented1to1Scores({ protocol: protocol(), scores: scores.slice(0, 3) }),
    (error) => error?.code === "score_coverage_mismatch",
  );
});
