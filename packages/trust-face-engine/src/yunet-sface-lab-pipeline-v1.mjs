import { runOpenCvYuNetLabDetectionV1 } from "./yunet-lab-detection-v1.mjs";
import { runOpenCvSFaceLabInferenceV1 } from "./sface-lab-inference-v1.mjs";
import { evaluateYuNetPoseQualityV1 } from "./pose-quality-gate-v1.mjs";
import { buildCaptureRetryV1 } from "./capture-retry-policy-v1.mjs";

export async function runOpenCvYuNetSFaceLabPipelineV1({
  yunetModelPath,
  sfaceModelPath,
  imagePath,
  pythonBin = "python3",
  detectorRunner,
  sfaceRunner,
} = {}) {
  const detection = await runOpenCvYuNetLabDetectionV1({
    modelPath: yunetModelPath,
    imagePath,
    pythonBin,
    ...(detectorRunner ? { runner: detectorRunner } : {}),
  });

  const poseQuality = evaluateYuNetPoseQualityV1(detection.faceBox);

  if (!poseQuality.accepted) {
    const retry = buildCaptureRetryV1(poseQuality);
    return Object.freeze({
      version: "trust-face-yunet-sface-lab-pipeline/v1",
      mode: "lab-only",
      status: "capture_retry_required",
      detector: Object.freeze({
        provider: detection.provider,
        modelId: detection.modelId,
        cvVersion: detection.cvVersion,
        detectionCount: detection.detectionCount,
        selectedScore: detection.selectedScore,
        sourceIntegrityVerified: detection.sourceIntegrityVerified,
      }),
      poseQuality: Object.freeze({
        version: poseQuality.version,
        accepted: false,
        retryCapture: true,
        reasons: poseQuality.reasons,
        productionReady: false,
        biometricClaimReady: false,
      }),
      retry,
      inference: null,
      sfaceInferenceAttempted: false,
      rawBiometricPayloadStored: false,
      decisionCreated: false,
      productionAuthorized: false,
      productionReady: false,
      biometricClaimReady: false,
    });
  }

  const inference = await runOpenCvSFaceLabInferenceV1({
    modelPath: sfaceModelPath,
    imagePath,
    faceBox: detection.faceBox,
    pythonBin,
    ...(sfaceRunner ? { runner: sfaceRunner } : {}),
  });

  return Object.freeze({
    version: "trust-face-yunet-sface-lab-pipeline/v1",
    mode: "lab-only",
    status: "inference_completed",
    detector: Object.freeze({
      provider: detection.provider,
      modelId: detection.modelId,
      cvVersion: detection.cvVersion,
      detectionCount: detection.detectionCount,
      selectedScore: detection.selectedScore,
      sourceIntegrityVerified: detection.sourceIntegrityVerified,
    }),
    poseQuality: Object.freeze({
      version: poseQuality.version,
      accepted: true,
      retryCapture: false,
      reasons: poseQuality.reasons,
      productionReady: false,
      biometricClaimReady: false,
    }),
    retry: Object.freeze({
      version: "trust-face-capture-retry-policy/v1",
      mode: "lab-only",
      required: false,
      reasonCodes: Object.freeze([]),
      actions: Object.freeze([]),
      primaryAction: null,
      retryBeforeSFace: false,
      sfaceInferenceAttempted: true,
      thresholdCalibrated: false,
      productionAuthorized: false,
      productionReady: false,
      biometricClaimReady: false,
    }),
    inference,
    sfaceInferenceAttempted: true,
    rawBiometricPayloadStored: false,
    decisionCreated: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
