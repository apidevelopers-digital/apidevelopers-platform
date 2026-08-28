const DEFAULT_MODEL_VERSION = "trust-face-embedding/v0-lab";
const DEFAULT_THRESHOLD_PROFILE = Object.freeze({
  id: "trust-face-1to1/lab-v0",
  cosineSimilarity: 0.82,
});

export class TrustFaceEngineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceEngineError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new TrustFaceEngineError(code, message);
}

function finite(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("invalid_numeric_value", `${field} must be a finite number`);
  }
  return value;
}

function bounded01(value, field) {
  const number = finite(value, field);
  if (number < 0 || number > 1) {
    fail("invalid_quality_signal", `${field} must be between 0 and 1`);
  }
  return number;
}

function normalizeVector(values, field) {
  if (!Array.isArray(values) && !(values instanceof Float32Array) && !(values instanceof Float64Array)) {
    fail("invalid_embedding", `${field} must be an array-like numeric vector`);
  }

  const vector = Array.from(values, (value, index) => finite(value, `${field}[${index}]`));
  if (vector.length < 3 || vector.length > 4096) {
    fail("invalid_embedding_dimension", `${field} dimension must be between 3 and 4096`);
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) {
    fail("zero_embedding", `${field} must have non-zero magnitude`);
  }

  return Object.freeze(vector.map((value) => value / magnitude));
}

function assertEmbeddingRecord(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_embedding", `${field} must be an embedding record`);
  }
  if (typeof value.modelVersion !== "string" || !value.modelVersion.trim()) {
    fail("invalid_model_version", `${field}.modelVersion is required`);
  }
  const vector = normalizeVector(value.vector, `${field}.vector`);
  return Object.freeze({
    modelVersion: value.modelVersion.trim(),
    vector,
  });
}

export const TRUST_FACE_ENGINE_PROFILE = Object.freeze({
  engineId: "apidevelopers.trust-face",
  mode: "lab-v0",
  productionReady: false,
  openSetIdentification: false,
  verification1to1: true,
  livenessPad: false,
  rawBiometricLogging: false,
  defaultModelVersion: DEFAULT_MODEL_VERSION,
  defaultThresholdProfile: DEFAULT_THRESHOLD_PROFILE,
});

export function evaluateCaptureQuality({
  faceDetected,
  faceCount = 1,
  sharpness,
  illumination,
  frontalness,
  occlusion,
} = {}) {
  if (faceDetected !== true) {
    return Object.freeze({
      passed: false,
      score: 0,
      reasonCodes: Object.freeze(["face_not_detected"]),
    });
  }
  if (!Number.isInteger(faceCount) || faceCount !== 1) {
    return Object.freeze({
      passed: false,
      score: 0,
      reasonCodes: Object.freeze(["single_face_required"]),
    });
  }

  const signals = Object.freeze({
    sharpness: bounded01(sharpness, "sharpness"),
    illumination: bounded01(illumination, "illumination"),
    frontalness: bounded01(frontalness, "frontalness"),
    occlusion: bounded01(occlusion, "occlusion"),
  });

  const score =
    signals.sharpness * 0.3 +
    signals.illumination * 0.2 +
    signals.frontalness * 0.3 +
    (1 - signals.occlusion) * 0.2;

  const reasons = [];
  if (signals.sharpness < 0.45) reasons.push("sharpness_low");
  if (signals.illumination < 0.4) reasons.push("illumination_low");
  if (signals.frontalness < 0.55) reasons.push("pose_not_frontal");
  if (signals.occlusion > 0.35) reasons.push("occlusion_high");
  if (score < 0.6) reasons.push("quality_score_low");

  return Object.freeze({
    passed: reasons.length === 0,
    score,
    reasonCodes: Object.freeze(reasons),
    signals,
  });
}

export function createFaceEmbedding({
  values,
  modelVersion = DEFAULT_MODEL_VERSION,
  quality = null,
} = {}) {
  if (quality && quality.passed !== true) {
    fail("capture_quality_rejected", "capture quality must pass before embedding can be accepted");
  }
  if (typeof modelVersion !== "string" || !modelVersion.trim()) {
    fail("invalid_model_version", "modelVersion is required");
  }

  return Object.freeze({
    modelVersion: modelVersion.trim(),
    vector: normalizeVector(values, "values"),
  });
}

export function cosineSimilarity(referenceEmbedding, probeEmbedding) {
  const reference = assertEmbeddingRecord(referenceEmbedding, "referenceEmbedding");
  const probe = assertEmbeddingRecord(probeEmbedding, "probeEmbedding");

  if (reference.modelVersion !== probe.modelVersion) {
    fail(
      "model_version_mismatch",
      "reference and probe embeddings must use the same modelVersion",
    );
  }
  if (reference.vector.length !== probe.vector.length) {
    fail("embedding_dimension_mismatch", "reference and probe dimensions must match");
  }

  let dot = 0;
  for (let index = 0; index < reference.vector.length; index += 1) {
    dot += reference.vector[index] * probe.vector[index];
  }

  return Math.max(-1, Math.min(1, dot));
}

export function verifyFacePair({
  referenceEmbedding,
  probeEmbedding,
  thresholdProfile = DEFAULT_THRESHOLD_PROFILE,
} = {}) {
  if (!thresholdProfile || typeof thresholdProfile !== "object") {
    fail("invalid_threshold_profile", "thresholdProfile must be an object");
  }
  if (typeof thresholdProfile.id !== "string" || !thresholdProfile.id.trim()) {
    fail("invalid_threshold_profile", "thresholdProfile.id is required");
  }

  const threshold = finite(thresholdProfile.cosineSimilarity, "thresholdProfile.cosineSimilarity");
  if (threshold < -1 || threshold > 1) {
    fail("invalid_threshold_profile", "cosine similarity threshold must be between -1 and 1");
  }

  const similarity = cosineSimilarity(referenceEmbedding, probeEmbedding);
  return Object.freeze({
    engineId: TRUST_FACE_ENGINE_PROFILE.engineId,
    mode: TRUST_FACE_ENGINE_PROFILE.mode,
    modelVersion: referenceEmbedding.modelVersion,
    thresholdProfileId: thresholdProfile.id.trim(),
    similarity,
    threshold,
    matched: similarity >= threshold,
    decisionCreated: false,
    livenessEvaluated: false,
  });
}

export function createThresholdProfile({ id, cosineSimilarity: threshold } = {}) {
  if (typeof id !== "string" || !id.trim()) {
    fail("invalid_threshold_profile", "id is required");
  }
  const value = finite(threshold, "cosineSimilarity");
  if (value < -1 || value > 1) {
    fail("invalid_threshold_profile", "cosineSimilarity must be between -1 and 1");
  }
  return Object.freeze({
    id: id.trim(),
    cosineSimilarity: value,
  });
}
