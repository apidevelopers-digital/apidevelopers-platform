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

export async function compareOpenCvYuNetSFacePairV1({
  yunetModelPath,
  sfaceModelPath,
  referenceImagePath,
  probeImagePath,
  pythonBin = "python3",
} = {}) {
  const reference = await runOpenCvYuNetSFaceLabPipelineV1({
    yunetModelPath,
    sfaceModelPath,
    imagePath: referenceImagePath,
    pythonBin,
  });
  const probe = await runOpenCvYuNetSFaceLabPipelineV1({
    yunetModelPath,
    sfaceModelPath,
    imagePath: probeImagePath,
    pythonBin,
  });

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
