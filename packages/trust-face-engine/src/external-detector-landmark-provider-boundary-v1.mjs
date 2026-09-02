import { assertConsentedRealEvaluationAuthorization } from "./consented-real-eval-auth-gate-v1.mjs";

export const TRUST_FACE_EXTERNAL_DETECTOR_LANDMARK_PROVIDER_BOUNDARY_V1 = Object.freeze({
  version: "trust-face-external-detector-landmark-provider-boundary/v1",
  purpose: "invoke-authorized-external-face-detector-and-five-landmark-provider-by-opaque-ref",
  mode: "candidate-external-provider-boundary",
  requiredLandmarkCount: 5,
  rawBiometricPayloadAccepted: false,
  binaryPayloadAccepted: false,
  detectorResultStored: false,
  providerAuthenticityVerified: false,
  externalIndependentValidationVerified: false,
  detectorProductionReady: false,
  landmarkProductionReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceExternalDetectorLandmarkProviderBoundaryV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceExternalDetectorLandmarkProviderBoundaryV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceExternalDetectorLandmarkProviderBoundaryV1Error(code, message);
};

const req = (value, field) => {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_external_detector_provider_field", `${field} is required`);
  }
  return value.trim();
};

const digest = (value, field) => {
  const normalized = req(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    fail("invalid_external_detector_provider_digest", `${field} must be sha256:<64 hex>`);
  }
  return normalized;
};

const forbidden = new Set([
  "image", "imageData", "rawImage", "pixels", "video", "videoData", "frames", "bytes", "buffer",
  "embedding", "embeddings", "vector", "vectors", "template", "biometricTemplate", "templatePayload",
  "ciphertext", "encryptedPayload", "payload", "privateKey", "publicKey", "keyMaterial", "kmsMaterial",
  "secret", "secretMaterial", "plaintext", "password", "token", "base64",
]);

function rejectRaw(value, seen = new Set()) {
  if (value == null || (typeof value !== "object" && typeof value !== "function")) return;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    fail("external_detector_provider_binary_payload_forbidden", "binary payload is forbidden");
  }
  if (seen.has(value)) {
    fail("external_detector_provider_circular_input", "circular input is forbidden");
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) {
      fail("external_detector_provider_sensitive_payload_forbidden", `${key} is forbidden`);
    }
    rejectRaw(child, seen);
  }
  seen.delete(value);
}

function assertProvider(provider) {
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
    fail("external_detector_provider_required", "provider is required");
  }
  rejectRaw(provider);
  const meta = {
    providerId: req(provider.providerId, "provider.providerId"),
    providerVersion: req(provider.providerVersion, "provider.providerVersion"),
    codeCommit: req(provider.codeCommit, "provider.codeCommit"),
    detectorModelDigest: digest(provider.detectorModelDigest, "provider.detectorModelDigest"),
    landmarkModelDigest: digest(provider.landmarkModelDigest, "provider.landmarkModelDigest"),
    evaluationDigest: digest(provider.evaluationDigest, "provider.evaluationDigest"),
    landmarkCount: provider.landmarkCount,
  };
  if (meta.landmarkCount !== 5) {
    fail("external_detector_provider_landmark_count_mismatch", "provider.landmarkCount must be 5");
  }
  if (typeof provider.detectByRef !== "function") {
    fail("external_detector_provider_detect_method_required", "provider.detectByRef is required");
  }
  return Object.freeze(meta);
}

function assertSampleRef(value) {
  const normalized = req(value, "sampleRef");
  if (normalized.length > 256) {
    fail("external_detector_provider_sample_ref_too_long", "sampleRef must be at most 256 characters");
  }
  if (/^(data:|base64:)/i.test(normalized)) {
    fail("external_detector_provider_inline_payload_forbidden", "sampleRef must not contain inline payload data");
  }
  return normalized;
}

const finiteUnit = (value, field) => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    fail("external_detector_provider_invalid_geometry", `${field} must be a finite value in [0,1]`);
  }
  return value;
};

function assertBoundingBox(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("external_detector_provider_invalid_bounding_box", "boundingBox is required when facePresent=true");
  }
  rejectRaw(value);
  const x = finiteUnit(value.x, "boundingBox.x");
  const y = finiteUnit(value.y, "boundingBox.y");
  const width = finiteUnit(value.width, "boundingBox.width");
  const height = finiteUnit(value.height, "boundingBox.height");
  if (width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
    fail("external_detector_provider_invalid_bounding_box", "boundingBox must have positive normalized dimensions inside the frame");
  }
  return Object.freeze({ x, y, width, height });
}

const landmarkKeys = Object.freeze(["leftEye", "rightEye", "nose", "mouthLeft", "mouthRight"]);

function assertLandmarks(value, box) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("external_detector_provider_invalid_landmarks", "five landmarks are required when facePresent=true");
  }
  rejectRaw(value);
  const out = {};
  for (const key of landmarkKeys) {
    const point = value[key];
    if (!point || typeof point !== "object" || Array.isArray(point)) {
      fail("external_detector_provider_invalid_landmarks", `${key} is required`);
    }
    const x = finiteUnit(point.x, `${key}.x`);
    const y = finiteUnit(point.y, `${key}.y`);
    if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) {
      fail("external_detector_provider_landmark_outside_face_box", `${key} must be inside boundingBox`);
    }
    out[key] = Object.freeze({ x, y });
  }
  return Object.freeze(out);
}

function assertDetectionResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    fail("external_detector_provider_invalid_result", "provider result is required");
  }
  rejectRaw(result);
  if (typeof result.facePresent !== "boolean") {
    fail("external_detector_provider_invalid_result", "facePresent must be boolean");
  }
  const confidence = finiteUnit(result.confidence, "confidence");

  if (!result.facePresent) {
    if (result.boundingBox != null || result.landmarks != null) {
      fail("external_detector_provider_face_absent_geometry_forbidden", "face-absent result must not contain boundingBox or landmarks");
    }
    return Object.freeze({ facePresent: false, confidence, boundingBox: null, landmarks: null });
  }

  const boundingBox = assertBoundingBox(result.boundingBox);
  const landmarks = assertLandmarks(result.landmarks, boundingBox);
  return Object.freeze({ facePresent: true, confidence, boundingBox, landmarks });
}

export function createExternalDetectorLandmarkProviderBoundary({
  provider,
  protocolDigest,
} = {}) {
  const providerMeta = assertProvider(provider);
  const expectedProtocolDigest = digest(protocolDigest, "protocolDigest");

  return Object.freeze({
    version: TRUST_FACE_EXTERNAL_DETECTOR_LANDMARK_PROVIDER_BOUNDARY_V1.version,
    purpose: TRUST_FACE_EXTERNAL_DETECTOR_LANDMARK_PROVIDER_BOUNDARY_V1.purpose,
    mode: TRUST_FACE_EXTERNAL_DETECTOR_LANDMARK_PROVIDER_BOUNDARY_V1.mode,
    providerId: providerMeta.providerId,
    providerVersion: providerMeta.providerVersion,
    codeCommit: providerMeta.codeCommit,
    detectorModelDigest: providerMeta.detectorModelDigest,
    landmarkModelDigest: providerMeta.landmarkModelDigest,
    evaluationDigest: providerMeta.evaluationDigest,
    landmarkCount: 5,
    rawBiometricPayloadAccepted: false,
    binaryPayloadAccepted: false,
    detectorResultStored: false,
    providerAuthenticityVerified: false,
    externalIndependentValidationVerified: false,
    detectorProductionReady: false,
    landmarkProductionReady: false,
    productionReady: false,
    biometricClaimReady: false,

    async detectByRef({ sampleRef, authorization, now } = {}) {
      rejectRaw({ authorization });
      const normalizedRef = assertSampleRef(sampleRef);
      const auth = assertConsentedRealEvaluationAuthorization({
        authorization,
        protocolDigest: expectedProtocolDigest,
        codeCommit: providerMeta.codeCommit,
        now,
      });

      const rawResult = await provider.detectByRef(Object.freeze({
        sampleRef: normalizedRef,
        providerId: providerMeta.providerId,
        providerVersion: providerMeta.providerVersion,
        detectorModelDigest: providerMeta.detectorModelDigest,
        landmarkModelDigest: providerMeta.landmarkModelDigest,
        evaluationDigest: providerMeta.evaluationDigest,
        authorizationId: auth.authorizationId,
        authorizationDigest: auth.authorizationDigest,
      }));

      const detection = assertDetectionResult(rawResult);

      return Object.freeze({
        providerId: providerMeta.providerId,
        providerVersion: providerMeta.providerVersion,
        detectorModelDigest: providerMeta.detectorModelDigest,
        landmarkModelDigest: providerMeta.landmarkModelDigest,
        evaluationDigest: providerMeta.evaluationDigest,
        authorizationId: auth.authorizationId,
        authorizationDigest: auth.authorizationDigest,
        ...detection,
        landmarkCount: detection.facePresent ? 5 : 0,
        detectorResultStored: false,
        providerAuthenticityVerified: false,
        externalIndependentValidationVerified: false,
        detectorProductionReady: false,
        landmarkProductionReady: false,
        productionReady: false,
        biometricClaimReady: false,
      });
    },
  });
}
