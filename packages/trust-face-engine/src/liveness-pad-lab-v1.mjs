import { createHash } from "node:crypto";

export const TRUST_FACE_LIVENESS_PAD_LAB_V1 = Object.freeze({
  version: "trust-face-liveness-pad-lab/v1",
  mode: "derived-signal-lab",
  rawImageAccepted: false,
  rawVideoAccepted: false,
  rawEmbeddingAccepted: false,
  activeChallengeExecuted: false,
  originAttested: false,
  realPadReady: false,
  benchmarkReady: false,
  productionReady: false,
  biometricClaimReady: false,
  defaultThresholdProfile: Object.freeze({ id: "trust-face-liveness-pad/lab-v1", padScore: 0.68 }),
});

const WEIGHTS = Object.freeze({
  temporalMotionConsistency: 0.3,
  depthConsistency: 0.3,
  textureNaturalness: 0.2,
  replayArtifactResistance: 0.2,
});
const MINIMUMS = Object.freeze({
  temporalMotionConsistency: 0.45,
  depthConsistency: 0.45,
  textureNaturalness: 0.45,
  replayArtifactResistance: 0.5,
});
const RAW = Object.freeze([
  "image", "imageData", "rawImage", "pixels", "video", "videoData", "frames",
  "bytes", "buffer", "embedding", "embeddings", "biometricTemplate", "template",
]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceLivenessPadLabV1Error";
  error.code = code;
  throw error;
}
function text(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_pad_field", `${field} is required`);
  return value.trim();
}
function n01(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    fail("invalid_pad_signal", `${field} must be between 0 and 1`);
  }
  return value;
}
function iso(value, field) {
  const valueText = text(value, field);
  const ms = Date.parse(valueText);
  if (!Number.isFinite(ms)) fail("invalid_pad_time", `${field} must be ISO-8601`);
  return { iso: new Date(ms).toISOString(), ms };
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function hash(value) {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}
function normalizeSignals(signals) {
  if (!signals || typeof signals !== "object" || Array.isArray(signals)) {
    fail("pad_signals_required", "signals must be an object");
  }
  for (const field of RAW) if (field in signals) fail("raw_pad_payload_forbidden", `${field} is forbidden`);
  return Object.freeze(Object.fromEntries(
    Object.keys(WEIGHTS).map((field) => [field, n01(signals[field], `signals.${field}`)]),
  ));
}
function normalizeThreshold(profile = TRUST_FACE_LIVENESS_PAD_LAB_V1.defaultThresholdProfile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    fail("invalid_pad_threshold_profile", "thresholdProfile must be an object");
  }
  return Object.freeze({ id: text(profile.id, "thresholdProfile.id"), padScore: n01(profile.padScore, "thresholdProfile.padScore") });
}
function evaluateNormalized(signals, threshold) {
  let padScore = 0;
  for (const [field, weight] of Object.entries(WEIGHTS)) padScore += signals[field] * weight;
  const reasonCodes = [];
  for (const [field, minimum] of Object.entries(MINIMUMS)) if (signals[field] < minimum) reasonCodes.push(`${field}_low`);
  if (padScore < threshold.padScore) reasonCodes.push("pad_score_low");
  return Object.freeze({
    padScore,
    thresholdProfileId: threshold.id,
    threshold: threshold.padScore,
    labSignalPassed: reasonCodes.length === 0,
    reasonCodes: Object.freeze(reasonCodes),
  });
}
function policy() {
  return {
    livenessEvaluatedInLab: true,
    livenessDecisionCreated: false,
    activeChallengeExecuted: false,
    originAttested: false,
    realPadReady: false,
    benchmarkReady: false,
    productionReady: false,
    biometricClaimReady: false,
  };
}

export function evaluateLivenessPadLab({ signals, thresholdProfile } = {}) {
  const normalizedSignals = normalizeSignals(signals);
  const threshold = normalizeThreshold(thresholdProfile);
  return Object.freeze({
    version: TRUST_FACE_LIVENESS_PAD_LAB_V1.version,
    mode: TRUST_FACE_LIVENESS_PAD_LAB_V1.mode,
    ...evaluateNormalized(normalizedSignals, threshold),
    signals: normalizedSignals,
    ...policy(),
  });
}

function body(id, createdAt, evaluation) {
  return Object.freeze({
    version: evaluation.version,
    purpose: "liveness-pad-derived-signal-lab-evidence",
    evidenceId: id,
    createdAt,
    mode: evaluation.mode,
    thresholdProfileId: evaluation.thresholdProfileId,
    threshold: evaluation.threshold,
    padScore: evaluation.padScore,
    labSignalPassed: evaluation.labSignalPassed,
    reasonCodes: evaluation.reasonCodes,
    signals: evaluation.signals,
    ...policy(),
  });
}

export function createLivenessPadLabEvidence({ evidenceId, signals, thresholdProfile, createdAt } = {}) {
  const id = text(evidenceId, "evidenceId");
  const time = iso(createdAt, "createdAt");
  const evaluation = evaluateLivenessPadLab({ signals, thresholdProfile });
  const evidenceBody = body(id, time.iso, evaluation);
  return Object.freeze({ ...evidenceBody, evidenceDigest: hash(evidenceBody) });
}

export function assertLivenessPadLabEvidence({ evidence, signals, thresholdProfile, now = null } = {}) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) fail("pad_evidence_required", "evidence is required");
  if (evidence.version !== TRUST_FACE_LIVENESS_PAD_LAB_V1.version) fail("pad_evidence_version_mismatch", "evidence version mismatch");
  if (evidence.purpose !== "liveness-pad-derived-signal-lab-evidence") fail("pad_evidence_purpose_mismatch", "evidence purpose mismatch");
  const expectedPolicy = policy();
  for (const [field, value] of Object.entries(expectedPolicy)) {
    if (evidence[field] !== value) fail("pad_evidence_policy_mismatch", `evidence ${field} mismatch`);
  }

  const id = text(evidence.evidenceId, "evidence.evidenceId");
  const time = iso(evidence.createdAt, "evidence.createdAt");
  if (now !== null && time.ms > iso(now, "now").ms) fail("pad_evidence_from_future", "evidence createdAt is after now");

  const evaluation = evaluateLivenessPadLab({ signals, thresholdProfile });
  const expectedBody = body(id, time.iso, evaluation);
  for (const [field, value] of Object.entries(expectedBody)) {
    if (stable(evidence[field]) !== stable(value)) fail(`pad_evidence_${field}_mismatch`, `evidence ${field} mismatch`);
  }
  const expectedDigest = hash(expectedBody);
  if (evidence.evidenceDigest !== expectedDigest) fail("pad_evidence_digest_mismatch", "evidence digest mismatch");

  return Object.freeze({
    valid: true,
    evidenceId: id,
    evidenceDigest: expectedDigest,
    padScore: evaluation.padScore,
    labSignalPassed: evaluation.labSignalPassed,
    ...expectedPolicy,
  });
}
