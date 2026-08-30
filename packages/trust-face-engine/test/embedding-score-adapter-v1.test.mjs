import assert from "node:assert/strict";
import test from "node:test";

import { createSyntheticBackboneCheckpoint } from "../src/backbone-inference-v1.mjs";
import {
  TRUST_FACE_EMBEDDING_SCORE_ADAPTER_V1,
  evaluateSyntheticProtocolWithBackbone,
} from "../src/embedding-score-adapter-v1.mjs";

function sample(offset = 0) {
  const pixels = Array.from({ length: 112 * 112 * 3 }, (_, i) => ((i % 89) / 88) * 0.7 + offset);
  return Object.freeze({ width: 112, height: 112, channels: 3, pixels: Object.freeze(pixels) });
}

function protocol() {
  return Object.freeze({
    authorityBasis: "consented-lab",
    realMetricsReady: false,
    pairs: Object.freeze([
      Object.freeze({ pairId: "genuine:a1::a2", sameSubject: true, referenceSampleId: "a1", probeSampleId: "a2" }),
      Object.freeze({ pairId: "genuine:b1::b2", sameSubject: true, referenceSampleId: "b1", probeSampleId: "b2" }),
      Object.freeze({ pairId: "impostor:a1::b2", sameSubject: false, referenceSampleId: "a1", probeSampleId: "b2" }),
      Object.freeze({ pairId: "impostor:b1::a2", sameSubject: false, referenceSampleId: "b1", probeSampleId: "a2" }),
    ]),
  });
}

test("adapter profile is explicitly synthetic-only", () => {
  assert.equal(TRUST_FACE_EMBEDDING_SCORE_ADAPTER_V1.embeddingDim, 512);
  assert.equal(TRUST_FACE_EMBEDDING_SCORE_ADAPTER_V1.score, "cosine");
  assert.equal(TRUST_FACE_EMBEDDING_SCORE_ADAPTER_V1.syntheticOnly, true);
  assert.equal(TRUST_FACE_EMBEDDING_SCORE_ADAPTER_V1.realMetricsReady, false);
  assert.equal(TRUST_FACE_EMBEDDING_SCORE_ADAPTER_V1.productionReady, false);
});

test("synthetic backbone embeddings become deterministic cosine scores and FMR/FNMR points", () => {
  const checkpoint = createSyntheticBackboneCheckpoint({ seed: 211 });
  const samplesById = Object.freeze({
    a1: sample(0.00),
    a2: sample(0.01),
    b1: sample(0.12),
    b2: sample(0.13),
  });

  const a = evaluateSyntheticProtocolWithBackbone({
    protocol: protocol(),
    samplesById,
    checkpoint,
    thresholds: [0.7, 0.8, 0.9],
  });
  const b = evaluateSyntheticProtocolWithBackbone({
    protocol: protocol(),
    samplesById,
    checkpoint,
    thresholds: [0.7, 0.8, 0.9],
  });

  assert.deepEqual(a, b);
  assert.equal(a.embeddingDim, 512);
  assert.equal(a.scoreMethod, "cosine");
  assert.equal(a.executionMode, "synthetic");
  assert.equal(a.pairCount, 4);
  assert.equal(a.realMetricsReady, false);
  assert.ok(a.scores.every((entry) => Number.isFinite(entry.score) && entry.score >= -1 && entry.score <= 1));
  assert.ok(a.operatingPoints.every((point) => Number.isFinite(point.fmr) && Number.isFinite(point.fnmr)));
});

test("adapter refuses real biometric execution", () => {
  const checkpoint = createSyntheticBackboneCheckpoint({ seed: 223 });
  assert.throws(
    () =>
      evaluateSyntheticProtocolWithBackbone({
        protocol: protocol(),
        samplesById: { a1: sample(), a2: sample(0.01), b1: sample(0.1), b2: sample(0.11) },
        checkpoint,
        execution: { mode: "consented-real", realBiometricExecutionAuthorized: true },
      }),
    (error) => error?.code === "real_biometric_execution_not_ready",
  );
});

test("adapter requires every protocol sample reference", () => {
  const checkpoint = createSyntheticBackboneCheckpoint({ seed: 227 });
  assert.throws(
    () =>
      evaluateSyntheticProtocolWithBackbone({
        protocol: protocol(),
        samplesById: { a1: sample(), a2: sample(0.01), b1: sample(0.1) },
        checkpoint,
      }),
    (error) => error?.code === "missing_sample",
  );
});
