export const TRUST_FACE_YUNET_POSE_QUALITY_V1 = Object.freeze({
  version: "trust-face-yunet-pose-quality/v1",
  mode: "lab-only",
  maxYawProxy: 0.30,
  maxRollProxy: 0.25,
  minEyeSpanBoxRatio: 0.35,
  retryOnReject: true,
  thresholdCalibrated: false,
  productionAuthorized: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceYuNetPoseQualityV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceYuNetPoseQualityV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceYuNetPoseQualityV1Error(code, message);
};

function normalizeFaceBox(faceBox) {
  if (!Array.isArray(faceBox) && !(faceBox instanceof Float32Array) && !(faceBox instanceof Float64Array)) {
    fail("invalid_pose_face_box", "faceBox must be an array-like numeric vector");
  }
  const values = Array.from(faceBox);
  if (values.length !== 14 && values.length !== 15) {
    fail("invalid_pose_face_box", "faceBox must contain bbox + 5 landmarks with optional detector score");
  }
  const normalized = values.slice(0, 14).map((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail("invalid_pose_face_box", `faceBox[${index}] must be finite`);
    }
    return value;
  });
  if (normalized[2] <= 0 || normalized[3] <= 0) {
    fail("invalid_pose_face_box", "bbox width and height must be positive");
  }
  return normalized;
}

export function evaluateYuNetPoseQualityV1(faceBox, profile = TRUST_FACE_YUNET_POSE_QUALITY_V1) {
  const values = normalizeFaceBox(faceBox);
  const [,, boxWidth] = values;
  const rightEye = { x: values[4], y: values[5] };
  const leftEye = { x: values[6], y: values[7] };
  const nose = { x: values[8], y: values[9] };

  const eyeDx = leftEye.x - rightEye.x;
  const eyeDy = leftEye.y - rightEye.y;
  const eyeSpan = Math.hypot(eyeDx, eyeDy);
  if (!Number.isFinite(eyeSpan) || eyeSpan <= Number.EPSILON) {
    fail("invalid_pose_landmarks", "eye landmarks must define a non-zero span");
  }

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const yawProxy = Math.abs(nose.x - eyeMidX) / eyeSpan;
  const rollProxy = Math.abs(eyeDy) / eyeSpan;
  const eyeSpanBoxRatio = eyeSpan / boxWidth;

  const reasons = [];
  if (yawProxy > profile.maxYawProxy) reasons.push("pose_yaw_out_of_lab_range");
  if (rollProxy > profile.maxRollProxy) reasons.push("pose_roll_out_of_lab_range");
  if (eyeSpanBoxRatio < profile.minEyeSpanBoxRatio) reasons.push("pose_eye_span_too_small");

  const accepted = reasons.length === 0;
  return Object.freeze({
    version: profile.version,
    mode: profile.mode,
    accepted,
    retryCapture: !accepted && profile.retryOnReject === true,
    reasons: Object.freeze(reasons),
    metrics: Object.freeze({
      yawProxy,
      rollProxy,
      eyeSpanBoxRatio,
    }),
    thresholdCalibrated: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function assertYuNetPoseQualityForSFaceV1(faceBox) {
  const result = evaluateYuNetPoseQualityV1(faceBox);
  if (!result.accepted) {
    fail("pose_quality_gate_rejected", "capture pose is outside the admitted laboratory range; retry capture");
  }
  return result;
}
