const VERSION = "trust-face-controlled-pilot-liveness-pad-boundary/v1";

export const TRUST_FACE_CONTROLLED_PILOT_LIVENESS_PAD_BOUNDARY_V1 = Object.freeze({
  version: VERSION,
  mode: "boundary-only",
  rawImageAccepted: false,
  rawVideoAccepted: false,
  rawEmbeddingAccepted: false,
  activeChallengeAuthorized: false,
  livenessEvaluationAuthorized: false,
  padEvaluationAuthorized: false,
  thresholdAuthorized: false,
  liveSpoofDecisionAuthorized: false,
  highAssurancePadClaimAuthorized: false,
  identityDecisionAuthorized: false,
  productionAuthorized: false,
  productionReady: false,
});

const RAW_FIELDS = Object.freeze([
  "image",
  "imageData",
  "rawImage",
  "pixels",
  "video",
  "videoData",
  "frames",
  "bytes",
  "buffer",
  "embedding",
  "embeddings",
  "biometricTemplate",
  "template",
]);

const DECISION_FIELDS = Object.freeze([
  "padScore",
  "livenessScore",
  "threshold",
  "thresholdProfile",
  "live",
  "spoof",
  "decision",
  "livenessDecision",
  "padDecision",
  "presentationAttackClass",
  "presentationAttackDetected",
  "matched",
  "identity",
]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceControlledPilotLivenessPadBoundaryV1Error";
  error.code = code;
  throw error;
}

function text(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_boundary_field", `${field} is required`);
  return value.trim();
}

function bool(value, field) {
  if (typeof value !== "boolean") fail("invalid_boundary_field", `${field} must be boolean`);
  return value;
}

function assertNoForbiddenPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    fail("boundary_payload_required", "payload must be an object");
  }
  for (const field of RAW_FIELDS) {
    if (Object.hasOwn(payload, field)) fail("raw_pad_payload_forbidden", `${field} is forbidden`);
  }
  for (const field of DECISION_FIELDS) {
    if (Object.hasOwn(payload, field)) fail("pad_decision_payload_forbidden", `${field} is forbidden`);
  }
  return payload;
}

function normalizeDigest(value) {
  if (value == null) return null;
  const digest = text(value, "evidenceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    fail("invalid_boundary_digest", "evidenceDigest must be sha256:<64 lowercase hex>");
  }
  return digest;
}

export function createControlledPilotLivenessPadBoundaryV1({
  source = "liveness-pad-lab-v1",
  evidenceDigest = null,
  labSignalObserved = false,
  notes = null,
  ...rest
} = {}) {
  assertNoForbiddenPayload(rest);
  const normalizedNotes = notes == null ? null : text(notes, "notes");
  return Object.freeze({
    version: VERSION,
    purpose: "controlled-pilot-liveness-pad-boundary",
    source: text(source, "source"),
    evidenceDigest: normalizeDigest(evidenceDigest),
    labSignalObserved: bool(labSignalObserved, "labSignalObserved"),
    notes: normalizedNotes,
    boundaryOnly: true,
    livenessEvaluated: false,
    padEvaluated: false,
    activeChallengeExecuted: false,
    originAttested: false,
    thresholdApplied: false,
    liveSpoofDecisionEmitted: false,
    highAssurancePadClaimed: false,
    identityDecisionEmitted: false,
    rawBiometricPayloadAccepted: false,
    rawBiometricPayloadPersisted: false,
    rawBiometricPayloadLogged: false,
    productionAuthorized: false,
    productionReady: false,
  });
}

export function assertControlledPilotLivenessPadBoundaryV1(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    fail("boundary_receipt_required", "receipt is required");
  }
  if (receipt.version !== VERSION) fail("boundary_version_mismatch", "receipt version mismatch");
  if (receipt.purpose !== "controlled-pilot-liveness-pad-boundary") {
    fail("boundary_purpose_mismatch", "receipt purpose mismatch");
  }

  const requiredFalse = [
    "livenessEvaluated",
    "padEvaluated",
    "activeChallengeExecuted",
    "originAttested",
    "thresholdApplied",
    "liveSpoofDecisionEmitted",
    "highAssurancePadClaimed",
    "identityDecisionEmitted",
    "rawBiometricPayloadAccepted",
    "rawBiometricPayloadPersisted",
    "rawBiometricPayloadLogged",
    "productionAuthorized",
    "productionReady",
  ];
  if (receipt.boundaryOnly !== true) fail("boundary_only_required", "boundaryOnly must be true");
  for (const field of requiredFalse) {
    if (receipt[field] !== false) fail("boundary_policy_violation", `${field} must remain false`);
  }
  normalizeDigest(receipt.evidenceDigest);
  bool(receipt.labSignalObserved, "labSignalObserved");
  text(receipt.source, "source");
  return Object.freeze({
    valid: true,
    version: VERSION,
    boundaryOnly: true,
    livenessEvaluated: false,
    padEvaluated: false,
    productionAuthorized: false,
  });
}
