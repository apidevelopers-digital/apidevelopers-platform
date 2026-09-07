import { createExternalTrainedBackboneAdmissionV1 } from "./external-trained-backbone-admission-v1.mjs";

export const TRUST_FACE_AURAFACE_512D_CANDIDATE_V1 = Object.freeze({
  version: "trust-face-auraface-512d-candidate/v1",
  mode: "lab-candidate-only",
  modelId: "fal-auraface-v1-glintr100-512d",
  modelFamily: "AuraFace/ResNet100-ArcFace",
  artifactFormat: "onnx",
  sourceRepository: "https://huggingface.co/fal/AuraFace-v1",
  sourcePath: "glintr100.onnx",
  sourceRevision: "af6d057c9b0ec4071d4c49c80e3539258798b609",
  artifactBytes: 260694151,
  weightsDigest: "sha256:a7933ea5330113b01c9b60351d8f4c33003f145d8470ac5f0e52ee2effe25c60",
  licenseSpdx: "Apache-2.0",
  licenseEvidenceRef:
    "https://huggingface.co/fal/AuraFace-v1/blob/af6d057c9b0ec4071d4c49c80e3539258798b609/LICENSE.md",
  modelCardEvidenceRef:
    "https://huggingface.co/fal/AuraFace-v1/blob/af6d057c9b0ec4071d4c49c80e3539258798b609/README.md",
  embeddingDim: 512,
  alignmentLandmarks: 5,
  inputWidth: 112,
  inputHeight: 112,
  trainingDataProvenanceStatus: "partial",
  trainingDataDisclosure:
    "publisher states commercial dataset from various sources; exact dataset composition is not disclosed",
  commercialUseClarified: true,
  authenticationUseClarified: false,
  independentValidationStatus: "none",
  evaluationDigest: null,
  sourceIntegrityVerified: false,
  weightsStoredInGitHub: false,
  rawBiometricPayloadStored: false,
  benchmarkExecutionAuthorized: false,
  productionAuthorized: false,
  productionReady: false,
  biometricClaimReady: false,
});

export function createAuraFace512dCandidateAdmissionV1({
  sourceIntegrityVerified = false,
} = {}) {
  return createExternalTrainedBackboneAdmissionV1({
    modelId: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.modelId,
    modelFamily: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.modelFamily,
    artifactFormat: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.artifactFormat,
    sourceRepository: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.sourceRepository,
    sourcePath: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.sourcePath,
    sourceRevision: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.sourceRevision,
    weightsDigest: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.weightsDigest,
    licenseSpdx: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.licenseSpdx,
    licenseEvidenceRef: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.licenseEvidenceRef,
    trainingDataProvenanceStatus:
      TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.trainingDataProvenanceStatus,
    commercialUseClarified:
      TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.commercialUseClarified,
    authenticationUseClarified:
      TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.authenticationUseClarified,
    independentValidationStatus:
      TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.independentValidationStatus,
    evaluationDigest: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.evaluationDigest,
    embeddingDim: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.embeddingDim,
    alignmentLandmarks: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.alignmentLandmarks,
    sourceIntegrityVerified,
  });
}
