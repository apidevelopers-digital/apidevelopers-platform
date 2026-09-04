import { cosineSimilarity } from "./index.mjs";
import { runOpenCvYuNetSFaceLabPipelineV1 } from "./yunet-sface-lab-pipeline-v1.mjs";

export function summarizeOpenCvYuNetSFacePairV1({ referenceInference, probeInference } = {}) {
  if (!referenceInference?.embedding || !probeInference?.embedding) {
    throw new TypeError("referenceInference.embedding and probeInference.embedding are required");
  }
  const similarity = cosineSimilarity(referenceInference.embedding, probeInference.embedding);
  return Object.freeze({
    version: "trust-face-yunet-sface-pair-comparison/v1",
    mode: "lab-only",
    comparisonCreated: true,
    modelVersion: referenceInference.embedding.modelVersion,
    embeddingDim: referenceInference.embedding.vector.length,
    cosineSimilarity: similarity,
    thresholdApplied: false,
    matchedClaimed: false,
    embeddingStored: false,
    rawBiometricPayloadStored: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function summarizeOpenCvYuNetSFaceRetryV1(reference, probe) {
  const retryTargets = [];
  if (reference.status === "capture_retry_required") retryTargets.push("reference");
  if (probe.status === "capture_retry_required") retryTargets.push("probe");

  return Object.freeze({
    version: "trust-face-yunet-sface-pair-comparison/v1",
    mode: "lab-only",
    comparisonCreated: false,
    retryCapture: true,
    retryTargets: Object.freeze(retryTargets),
    referenceRetry: reference.retry?.required === true ? reference.retry : null,
    probeRetry: probe.retry?.required === true ? probe.retry : null,
    cosineSimilarity: null,
    thresholdApplied: false,
    matchedClaimed: false,
    embeddingStored: false,
    rawBiometricPayloadStored: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export async function compareOpenCvYuNetSFacePairV1({
  yunetModelPath,
  sfaceModelPath,
  referenceImagePath,
  probeImagePath,
  pythonBin = "python3",
  referenceDetectorRunner,
  probeDetectorRunner,
  referenceSfaceRunner,
  probeSfaceRunner,
} = {}) {
  const reference = await runOpenCvYuNetSFaceLabPipelineV1({
    yunetModelPath,
    sfaceModelPath,
    imagePath: referenceImagePath,
    pythonBin,
    ...(referenceDetectorRunner ? { detectorRunner: referenceDetectorRunner } : {}),
    ...(referenceSfaceRunner ? { sfaceRunner: referenceSfaceRunner } : {}),
  });

  const probe = await runOpenCvYuNetSFaceLabPipelineV1({
    yunetModelPath,
    sfaceModelPath,
    imagePath: probeImagePath,
    pythonBin,
    ...(probeDetectorRunner ? { detectorRunner: probeDetectorRunner } : {}),
    ...(probeSfaceRunner ? { sfaceRunner: probeSfaceRunner } : {}),
  });

  if (reference.status !== "inference_completed" || probe.status !== "inference_completed") {
    return summarizeOpenCvYuNetSFaceRetryV1(reference, probe);
  }

  const comparison = summarizeOpenCvYuNetSFacePairV1({
    referenceInference: reference.inference,
    probeInference: probe.inference,
  });

  return Object.freeze({
    ...comparison,
    referenceDetectionCount: reference.detector.detectionCount,
    referenceSelectedScore: reference.detector.selectedScore,
    probeDetectionCount: probe.detector.detectionCount,
    probeSelectedScore: probe.detector.selectedScore,
    detectorSourceIntegrityVerified:
      reference.detector.sourceIntegrityVerified === true &&
      probe.detector.sourceIntegrityVerified === true,
    sfaceSourceIntegrityVerified:
      reference.inference.weightsDigest === probe.inference.weightsDigest,
  });
}
