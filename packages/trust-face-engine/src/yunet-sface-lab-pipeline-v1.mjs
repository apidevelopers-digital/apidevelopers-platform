import { runOpenCvYuNetLabDetectionV1 } from "./yunet-lab-detection-v1.mjs";
import { runOpenCvSFaceLabInferenceV1 } from "./sface-lab-inference-v1.mjs";

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
    detector: Object.freeze({
      provider: detection.provider,
      modelId: detection.modelId,
      cvVersion: detection.cvVersion,
      detectionCount: detection.detectionCount,
      selectedScore: detection.selectedScore,
      sourceIntegrityVerified: detection.sourceIntegrityVerified,
    }),
    inference,
    rawBiometricPayloadStored: false,
    decisionCreated: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
