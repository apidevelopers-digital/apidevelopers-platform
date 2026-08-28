import { createFaceEmbedding, cosineSimilarity } from "./index.mjs";

export const TRUST_FACE_METRIC_LAB_PROFILE = Object.freeze({
  modelFamily: "trust-face-metric/v0-lab",
  productionReady: false,
  biometricClaimReady: false,
  livenessPad: false,
  requiresLabeledTrainingData: true,
  trainingObjective: "dimension-weighted supervised metric baseline",
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceMetricLabError";
  error.code = code;
  throw error;
}

function assertVector(vector, field) {
  if (!Array.isArray(vector) && !(vector instanceof Float32Array) && !(vector instanceof Float64Array)) {
    fail("invalid_training_vector", `${field} must be an array-like numeric vector`);
  }
  const values = Array.from(vector, Number);
  if (values.length < 3 || values.length > 4096) {
    fail("invalid_training_vector_dimension", `${field} dimension must be between 3 and 4096`);
  }
  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) fail("invalid_training_vector", `${field}[${i}] must be finite`);
  }
  return values;
}

function normalize(values) {
  let magnitudeSquared = 0;
  for (const value of values) magnitudeSquared += value * value;
  const magnitude = Math.sqrt(magnitudeSquared);
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) {
    fail("zero_metric_embedding", "weighted embedding must have non-zero magnitude");
  }
  return Object.freeze(values.map((value) => value / magnitude));
}

export function trainMetricModel({ samples, modelVersion = "trust-face-metric/v0-lab", epsilon = 1e-9 } = {}) {
  if (!Array.isArray(samples) || samples.length < 4) {
    fail("insufficient_training_samples", "at least four labeled samples are required");
  }
  if (typeof modelVersion !== "string" || !modelVersion.trim()) fail("invalid_model_version", "modelVersion is required");

  const prepared = samples.map((sample, index) => {
    if (!sample || typeof sample !== "object") fail("invalid_training_sample", `samples[${index}] must be an object`);
    if (typeof sample.subjectId !== "string" || !sample.subjectId.trim()) {
      fail("invalid_subject_id", `samples[${index}].subjectId is required`);
    }
    return { subjectId: sample.subjectId.trim(), vector: assertVector(sample.vector, `samples[${index}].vector`) };
  });

  const dimension = prepared[0].vector.length;
  if (prepared.some((sample) => sample.vector.length !== dimension)) {
    fail("training_dimension_mismatch", "all training vectors must share the same dimension");
  }

  const bySubject = new Map();
  for (const sample of prepared) {
    const list = bySubject.get(sample.subjectId) ?? [];
    list.push(sample.vector);
    bySubject.set(sample.subjectId, list);
  }
  if (bySubject.size < 2) fail("insufficient_subjects", "at least two distinct subjects are required");
  for (const [subjectId, vectors] of bySubject) {
    if (vectors.length < 2) fail("insufficient_subject_samples", `subject ${subjectId} requires at least two samples`);
  }

  const globalMean = new Array(dimension).fill(0);
  for (const sample of prepared) for (let d = 0; d < dimension; d += 1) globalMean[d] += sample.vector[d];
  for (let d = 0; d < dimension; d += 1) globalMean[d] /= prepared.length;

  const within = new Array(dimension).fill(0);
  const between = new Array(dimension).fill(0);

  for (const vectors of bySubject.values()) {
    const subjectMean = new Array(dimension).fill(0);
    for (const vector of vectors) for (let d = 0; d < dimension; d += 1) subjectMean[d] += vector[d];
    for (let d = 0; d < dimension; d += 1) subjectMean[d] /= vectors.length;

    for (const vector of vectors) {
      for (let d = 0; d < dimension; d += 1) {
        const delta = vector[d] - subjectMean[d];
        within[d] += delta * delta;
      }
    }
    for (let d = 0; d < dimension; d += 1) {
      const delta = subjectMean[d] - globalMean[d];
      between[d] += vectors.length * delta * delta;
    }
  }

  const rawWeights = between.map((value, d) => Math.sqrt((value + epsilon) / (within[d] + epsilon)));
  const meanWeight = rawWeights.reduce((sum, value) => sum + value, 0) / rawWeights.length;
  const weights = Object.freeze(rawWeights.map((value) => value / meanWeight));

  return Object.freeze({
    profile: TRUST_FACE_METRIC_LAB_PROFILE,
    modelVersion: modelVersion.trim(),
    dimension,
    subjectCount: bySubject.size,
    sampleCount: prepared.length,
    weights,
    trainingSummary: Object.freeze({
      objective: TRUST_FACE_METRIC_LAB_PROFILE.trainingObjective,
      labeledSubjects: bySubject.size,
      labeledSamples: prepared.length,
    }),
  });
}

export function applyMetricModel({ model, vector } = {}) {
  if (!model || typeof model !== "object" || !Array.isArray(model.weights)) {
    fail("invalid_metric_model", "model.weights is required");
  }
  const values = assertVector(vector, "vector");
  if (values.length !== model.weights.length) fail("metric_dimension_mismatch", "vector dimension must match model weights");
  const weighted = values.map((value, index) => value * model.weights[index]);
  return createFaceEmbedding({ values: normalize(weighted), modelVersion: model.modelVersion });
}

export function scoreVerificationPair({ model, referenceVector, probeVector } = {}) {
  const reference = applyMetricModel({ model, vector: referenceVector });
  const probe = applyMetricModel({ model, vector: probeVector });
  return cosineSimilarity(reference, probe);
}

function confusionAtThreshold(pairs, threshold) {
  let genuine = 0, impostor = 0, falseNonMatch = 0, falseMatch = 0;
  for (const pair of pairs) {
    const matched = pair.score >= threshold;
    if (pair.sameSubject) {
      genuine += 1;
      if (!matched) falseNonMatch += 1;
    } else {
      impostor += 1;
      if (matched) falseMatch += 1;
    }
  }
  if (genuine === 0 || impostor === 0) fail("invalid_evaluation_pairs", "evaluation requires genuine and impostor pairs");
  return Object.freeze({
    threshold,
    genuinePairs: genuine,
    impostorPairs: impostor,
    fmr: falseMatch / impostor,
    fnmr: falseNonMatch / genuine,
    falseMatches: falseMatch,
    falseNonMatches: falseNonMatch,
  });
}

export function evaluateVerification({ model, pairs, thresholds = [0.5, 0.6, 0.7, 0.8, 0.9] } = {}) {
  if (!Array.isArray(pairs) || pairs.length < 2) fail("invalid_evaluation_pairs", "pairs must contain at least two entries");

  const scored = pairs.map((pair, index) => {
    if (!pair || typeof pair !== "object" || typeof pair.sameSubject !== "boolean") {
      fail("invalid_evaluation_pair", `pairs[${index}] is invalid`);
    }
    return Object.freeze({
      sameSubject: pair.sameSubject,
      score: scoreVerificationPair({
        model,
        referenceVector: pair.referenceVector,
        probeVector: pair.probeVector,
      }),
    });
  });

  const operatingPoints = thresholds.map((threshold) => {
    if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
      fail("invalid_threshold", "thresholds must be finite values between -1 and 1");
    }
    return confusionAtThreshold(scored, threshold);
  });

  let best = operatingPoints[0];
  let bestGap = Math.abs(best.fmr - best.fnmr);
  for (const point of operatingPoints.slice(1)) {
    const gap = Math.abs(point.fmr - point.fnmr);
    if (gap < bestGap) { best = point; bestGap = gap; }
  }

  return Object.freeze({
    modelVersion: model.modelVersion,
    pairCount: scored.length,
    operatingPoints: Object.freeze(operatingPoints),
    approximateEerPoint: best,
    productionClaimReady: false,
  });
}
