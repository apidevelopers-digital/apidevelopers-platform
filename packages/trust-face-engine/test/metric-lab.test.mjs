import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_METRIC_LAB_PROFILE,
  applyMetricModel,
  evaluateVerification,
  scoreVerificationPair,
  trainMetricModel,
} from "../src/metric-lab.mjs";

const samples = [
  { subjectId: "a", vector: [1.0, 0.1, 0.2, 0.1] },
  { subjectId: "a", vector: [0.95, 0.12, 0.18, 0.08] },
  { subjectId: "b", vector: [0.1, 1.0, 0.15, 0.2] },
  { subjectId: "b", vector: [0.12, 0.94, 0.12, 0.22] },
  { subjectId: "c", vector: [0.2, 0.1, 1.0, 0.15] },
  { subjectId: "c", vector: [0.18, 0.12, 0.95, 0.17] },
];

test("metric lab profile forbids production claims", () => {
  assert.equal(TRUST_FACE_METRIC_LAB_PROFILE.productionReady, false);
  assert.equal(TRUST_FACE_METRIC_LAB_PROFILE.biometricClaimReady, false);
  assert.equal(TRUST_FACE_METRIC_LAB_PROFILE.livenessPad, false);
});

test("training produces deterministic supervised weights", () => {
  const first = trainMetricModel({ samples });
  const second = trainMetricModel({ samples });

  assert.equal(first.subjectCount, 3);
  assert.equal(first.sampleCount, 6);
  assert.equal(first.dimension, 4);
  assert.deepEqual(first.weights, second.weights);
  assert.ok(first.weights.every(Number.isFinite));
});

test("trained model emits normalized metric embedding", () => {
  const model = trainMetricModel({ samples });
  const embedding = applyMetricModel({ model, vector: [1, 0.1, 0.2, 0.1] });
  const magnitude = Math.sqrt(embedding.vector.reduce((sum, value) => sum + value * value, 0));

  assert.equal(embedding.modelVersion, model.modelVersion);
  assert.ok(Math.abs(magnitude - 1) < 1e-12);
});

test("same-subject pair scores above a clearly different pair", () => {
  const model = trainMetricModel({ samples });
  const genuine = scoreVerificationPair({
    model,
    referenceVector: [1.0, 0.1, 0.2, 0.1],
    probeVector: [0.95, 0.12, 0.18, 0.08],
  });
  const impostor = scoreVerificationPair({
    model,
    referenceVector: [1.0, 0.1, 0.2, 0.1],
    probeVector: [0.12, 0.94, 0.12, 0.22],
  });

  assert.ok(genuine > impostor);
});

test("evaluation reports FMR and FNMR without production claim", () => {
  const model = trainMetricModel({ samples });
  const report = evaluateVerification({
    model,
    thresholds: [0.5, 0.7, 0.9],
    pairs: [
      { sameSubject: true, referenceVector: samples[0].vector, probeVector: samples[1].vector },
      { sameSubject: true, referenceVector: samples[2].vector, probeVector: samples[3].vector },
      { sameSubject: false, referenceVector: samples[0].vector, probeVector: samples[2].vector },
      { sameSubject: false, referenceVector: samples[0].vector, probeVector: samples[4].vector },
    ],
  });

  assert.equal(report.productionClaimReady, false);
  assert.equal(report.operatingPoints.length, 3);
  for (const point of report.operatingPoints) {
    assert.ok(point.fmr >= 0 && point.fmr <= 1);
    assert.ok(point.fnmr >= 0 && point.fnmr <= 1);
  }
});

test("training fails closed when a subject has only one sample", () => {
  assert.throws(
    () => trainMetricModel({
      samples: [
        { subjectId: "a", vector: [1, 0, 0] },
        { subjectId: "a", vector: [0.9, 0.1, 0] },
        { subjectId: "b", vector: [0, 1, 0] },
        { subjectId: "c", vector: [0, 0, 1] },
      ],
    }),
    (error) => error?.code === "insufficient_subject_samples",
  );
});
