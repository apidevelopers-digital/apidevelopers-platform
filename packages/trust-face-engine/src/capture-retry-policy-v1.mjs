export const TRUST_FACE_CAPTURE_RETRY_POLICY_V1 = Object.freeze({
  version: "trust-face-capture-retry-policy/v1",
  mode: "lab-only",
  retryBeforeSFace: true,
  thresholdCalibrated: false,
  productionAuthorized: false,
  productionReady: false,
  biometricClaimReady: false,
});

const ALLINT_ACTIONS = Object.freeze({
  pose_yaw_out_of_lab_range: Object.freeze({
    code: "center_face",
    guidance: "center your face and look more directly at the camera",
  }),
  pose_roll_out_of_lab_range: Object.freeze({
    code: "level_head",
    guidance: "keep your head level and try the capture again",
  }),
  pose_eye_span_too_small: Object.freeze({
    code: "move_closer",
    guidance: "move closer to the camera while keeping both eyes visible",
  }),
});

export function buildCaptureRetryV1(poseQuality) {
  if (!poseQuality || poseQuality.accepted !== false || poseQuality.retryCapture !== true) {
    throw new TypeError("poseQuality must be a rejected retryable pose result");
  }

  const reasonCodes = Array.from(poseQuality.reasons ?? []);
  const actions = reasonCodes.map((code) => ALLINT_ACTIONS[code] ?? Object.freeze({
    code: "retry_capture",
    guidance: "retry the capture with a moderate, front-facing pose",
  }));

  return Object.freeze({
    version: TRUST_FACE_CAPTURE_RETRY_POLICY_V1.version,
    mode: TRUST_FACE_CAPTURE_RETRY_POLICY_V1.mode,
    required: true,
    reasonCodes: Object.freeze(reasonCodes),
    actions: Object.freeze(actions),
    primaryAction: actions[0]?.code ?? "retry_capture",
    retryBeforeSFace: true,
    sfaceInferenceAttempted: false,
    thresholdCalibrated: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
