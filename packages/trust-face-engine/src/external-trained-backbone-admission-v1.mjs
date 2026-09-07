import { createHash } from "node:crypto";

export const TRUST_FACE_EXTERNAL_TRAINED_BACKBONE_ADMISSION_V1 = Object.freeze({
  version: "trust-face-external-trained-backbone-admission/v1",
  mode: "lab-only",
  supportedLabEmbeddingDims: Object.freeze([128, 512]),
  requiredProductEmbeddingDim: 512,
  requiredAlignmentLandmarks: 5,
  rawBiometricPayloadAccepted: false,
  modelWeightsStoredByReceipt: false,
  commercialUseAuthorizedByDefault: false,
  authenticationUseAuthorizedByDefault: false,
  independentValidationVerifiedByDefault: false,
  productionReadyByDefault: false,
  biometricClaimReadyByDefault: false,
});

export class TrustFaceExternalTrainedBackboneAdmissionV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceExternalTrainedBackboneAdmissionV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceExternalTrainedBackboneAdmissionV1Error(code, message);
};

const required = (value, field) => {
  if (typeof value !== "string" || !value.trim()) fail("invalid_admission_field", `${field} is required`);
  return value.trim();
};

const digest = (value, field) => {
  const normalized = required(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    fail("invalid_admission_digest", `${field} must be sha256:<64 hex>`);
  }
  return normalized;
};

const stable = (value) =>
  Array.isArray(value)
    ? `[${value.map(stable).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
      : JSON.stringify(value);

const sha = (value) => `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;

const LICENSES = new Set(["Apache-2.0", "MIT", "BSD-3-Clause"]);
const PROVENANCE = new Set(["unknown", "partial", "documented"]);
const VALIDATION = new Set(["none", "partial", "verified"]);
const LAB_EMBEDDING_DIMS = new Set(TRUST_FACE_EXTERNAL_TRAINED_BACKBONE_ADMISSION_V1.supportedLabEmbeddingDims);

export function createExternalTrainedBackboneAdmissionV1({
  modelId,
  modelFamily,
  artifactFormat,
  sourceRepository,
  sourcePath,
  sourceRevision,
  weightsDigest,
  licenseSpdx,
  licenseEvidenceRef,
  trainingDataProvenanceStatus = "unknown",
  commercialUseClarified = false,
  authenticationUseClarified = false,
  independentValidationStatus = "none",
  evaluationDigest = null,
  embeddingDim = TRUST_FACE_EXTERNAL_TRAINED_BACKBONE_ADMISSION_V1.requiredProductEmbeddingDim,
  alignmentLandmarks = 5,
  sourceIntegrityVerified = false,
} = {}) {
  const id = required(modelId, "modelId");
  const family = required(modelFamily, "modelFamily");
  const format = required(artifactFormat, "artifactFormat").toLowerCase();
  if (format !== "onnx") fail("unsupported_artifact_format", "artifactFormat must be onnx");

  const repository = required(sourceRepository, "sourceRepository");
  const path = required(sourcePath, "sourcePath");
  const revision = required(sourceRevision, "sourceRevision");
  const modelDigest = digest(weightsDigest, "weightsDigest");
  const license = required(licenseSpdx, "licenseSpdx");
  const licenseRef = required(licenseEvidenceRef, "licenseEvidenceRef");

  if (!LICENSES.has(license)) fail("unsupported_model_license", "licenseSpdx is not in the admitted lab allowlist");
  if (!PROVENANCE.has(trainingDataProvenanceStatus)) {
    fail("invalid_training_data_provenance_status", "unsupported trainingDataProvenanceStatus");
  }
  if (!VALIDATION.has(independentValidationStatus)) {
    fail("invalid_independent_validation_status", "unsupported independentValidationStatus");
  }
  if (!Number.isInteger(embeddingDim) || !LAB_EMBEDDING_DIMS.has(embeddingDim)) {
    fail(
      "invalid_embedding_dim",
      `embeddingDim must be one of ${[...LAB_EMBEDDING_DIMS].join(", ")} for lab admission`,
    );
  }
  if (alignmentLandmarks !== TRUST_FACE_EXTERNAL_TRAINED_BACKBONE_ADMISSION_V1.requiredAlignmentLandmarks) {
    fail("invalid_alignment_landmarks", "alignmentLandmarks must be 5");
  }

  const evaluation = evaluationDigest === null ? null : digest(evaluationDigest, "evaluationDigest");
  const labEligible = sourceIntegrityVerified === true;
  const productEmbeddingDimCompatible =
    embeddingDim === TRUST_FACE_EXTERNAL_TRAINED_BACKBONE_ADMISSION_V1.requiredProductEmbeddingDim;

  const productEligible =
    labEligible &&
    productEmbeddingDimCompatible &&
    trainingDataProvenanceStatus === "documented" &&
    commercialUseClarified === true &&
    authenticationUseClarified === true &&
    independentValidationStatus === "verified" &&
    Boolean(evaluation);

  const body = Object.freeze({
    version: TRUST_FACE_EXTERNAL_TRAINED_BACKBONE_ADMISSION_V1.version,
    mode: "lab-only",
    modelId: id,
    modelFamily: family,
    artifactFormat: "onnx",
    sourceRepository: repository,
    sourcePath: path,
    sourceRevision: revision,
    weightsDigest: modelDigest,
    licenseSpdx: license,
    licenseEvidenceRef: licenseRef,
    trainingDataProvenanceStatus,
    commercialUseClarified: commercialUseClarified === true,
    authenticationUseClarified: authenticationUseClarified === true,
    independentValidationStatus,
    evaluationDigest: evaluation,
    embeddingDim,
    requiredProductEmbeddingDim: TRUST_FACE_EXTERNAL_TRAINED_BACKBONE_ADMISSION_V1.requiredProductEmbeddingDim,
    productEmbeddingDimCompatible,
    alignmentLandmarks: 5,
    sourceIntegrityVerified: sourceIntegrityVerified === true,
    externallyTrainedWeightsPresent: true,
    labInferenceEligible: labEligible,
    productUseEligible: productEligible,
    rawBiometricPayloadAccepted: false,
    modelWeightsStoredByReceipt: false,
    providerAuthenticityVerified: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });

  return Object.freeze({ ...body, admissionDigest: sha(body) });
}
