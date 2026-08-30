import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1,
  evaluateConsented1to1Scores,
} from "../src/consented-1to1-evaluator-v1.mjs";

function protocol() {
  return Object.freeze({
    protocolDigest: "sha256:fixture",
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

const syntheticScores = Object.freeze([
  Object.freeze({ pairId: "genuine:a1::a2", score: 0.92 }),
  Object.freeze({ pairId: "genuine:b1::b2", score: 0.88 }),
  Object.freeze({ pairId: "impostor:a1::b2", score: 0.31 }),
  Object.freeze({ pairId: "impostor:b1::a2", score: 0.27 }),
]);

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
    thresholds: [0.3, 0.5, 0.7, 0.9],
  });
  const b = evaluateConsented1to1Scores({
    protocol: protocol(),
    scores: syntheticScores,
    thresholds: [0.3, 0.5, 0.7, 0.9],
  });
  assert.deepEqual(a, b);
  assert.equal(a.executionMode, "synthetic");
  assert.equal(a.realMetricsReady, false);
  assert.equal(a.pairCount, 4);
  assert.ok(a.operatingPoints.every((point) => Number.isFinite(point.fmr) && Number.isFinite(point.fnmr)));
});

test("consented-real mode remains blocked without explicit runtime authorization", () => {
  assert.throws(
    () => evaluateConsented1to1Scores({
      protocol: protocol(),
      scores: syntheticScores,
      execution: { mode: "consented-real", realBiometricExecutionAuthorized: false },
    }),
    (error) => error?.code === "real_biometric_execution_not_authorized",
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
