import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createExternalTrainedBackboneAdmissionV1 } from "./external-trained-backbone-admission-v1.mjs";

export const TRUST_FACE_SFACE_LAB_INFERENCE_V1 = Object.freeze({
  version: "trust-face-sface-lab-inference/v1",
  mode: "lab-only",
  provider: "OpenCV FaceRecognizerSF",
  modelId: "opencv-sface-2021dec",
  modelFamily: "SFace/MobileFaceNet",
  artifactFormat: "onnx",
  sourceRepository: "https://github.com/opencv/opencv_zoo",
  sourceRevision: "47534e27c9851bb1128ccc0102f1145e27f23f98",
  sourcePath: "models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
  weightsDigest: "sha256:0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
  artifactBytes: 38696353,
  licenseSpdx: "Apache-2.0",
  licenseEvidenceRef:
    "opencv/opencv_zoo@47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_recognition_sface/LICENSE",
  embeddingDim: 128,
  requiredProductEmbeddingDim: 512,
  productEmbeddingDimCompatible: false,
  embeddingDimArtifactVerified: false,
  alignmentLandmarks: 5,
  autoDownload: false,
  trainingDataProvenanceStatus: "unknown",
  commercialUseClarified: false,
  authenticationUseClarified: false,
  independentValidationStatus: "none",
  productionAuthorized: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceSFaceLabInferenceV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceSFaceLabInferenceV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceSFaceLabInferenceV1Error(code, message);
};

async function regularFile(path, field) {
  if (typeof path !== "string" || !path.trim() || path.includes("\0")) {
    fail("invalid_lab_path", `${field} is required`);
  }
  try {
    const info = await stat(path);
    if (!info.isFile()) fail("invalid_lab_file", `${field} must be a regular file`);
    return info;
  } catch (error) {
    if (error instanceof TrustFaceSFaceLabInferenceV1Error) throw error;
    fail("lab_file_not_found", `${field} does not exist`);
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}

export function normalizeSFaceFaceBoxV1(faceBox) {
  if (!Array.isArray(faceBox) && !(faceBox instanceof Float32Array) && !(faceBox instanceof Float64Array)) {
    fail("invalid_face_box", "faceBox must be an array-like numeric vector");
  }
  const values = Array.from(faceBox);
  if (values.length !== 14 && values.length !== 15) {
    fail("invalid_face_box", "faceBox must contain bbox + 5 landmarks, with optional detector score");
  }
  const normalized = values.slice(0, 14).map((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail("invalid_face_box", `faceBox[${index}] must be finite`);
    }
    return value;
  });
  if (normalized[2] <= 0 || normalized[3] <= 0) {
    fail("invalid_face_box", "faceBox width and height must be positive");
  }
  return Object.freeze(normalized);
}

export async function inspectOpenCvSFaceArtifactV1({ modelPath } = {}) {
  const info = await regularFile(modelPath, "modelPath");
  const actualDigest = await sha256File(modelPath);
  const digestMatches = actualDigest === TRUST_FACE_SFACE_LAB_INFERENCE_V1.weightsDigest;
  const sizeMatches = info.size === TRUST_FACE_SFACE_LAB_INFERENCE_V1.artifactBytes;
  return Object.freeze({
    version: "trust-face-sface-artifact-inspection/v1",
    expectedDigest: TRUST_FACE_SFACE_LAB_INFERENCE_V1.weightsDigest,
    actualDigest,
    expectedBytes: TRUST_FACE_SFACE_LAB_INFERENCE_V1.artifactBytes,
    actualBytes: info.size,
    digestMatches,
    sizeMatches,
    sourceIntegrityVerified: digestMatches && sizeMatches,
    modelWeightsStoredByReceipt: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

function admissionFor(verified) {
  const profile = TRUST_FACE_SFACE_LAB_INFERENCE_V1;
  return createExternalTrainedBackboneAdmissionV1({
    modelId: profile.modelId,
    modelFamily: profile.modelFamily,
    artifactFormat: profile.artifactFormat,
    sourceRepository: profile.sourceRepository,
    sourcePath: profile.sourcePath,
    sourceRevision: profile.sourceRevision,
    weightsDigest: profile.weightsDigest,
    licenseSpdx: profile.licenseSpdx,
    licenseEvidenceRef: profile.licenseEvidenceRef,
    trainingDataProvenanceStatus: profile.trainingDataProvenanceStatus,
    commercialUseClarified: false,
    authenticationUseClarified: false,
    independentValidationStatus: "none",
    evaluationDigest: null,
    embeddingDim: profile.embeddingDim,
    alignmentLandmarks: profile.alignmentLandmarks,
    sourceIntegrityVerified: verified,
  });
}

function normalizeEmbedding(values) {
  if (!Array.isArray(values) || values.length !== TRUST_FACE_SFACE_LAB_INFERENCE_V1.embeddingDim) {
    fail(
      "invalid_sface_embedding",
      `SFace runtime must return a ${TRUST_FACE_SFACE_LAB_INFERENCE_V1.embeddingDim}D embedding`,
    );
  }
  const vector = values.map((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail("invalid_sface_embedding", `embedding[${index}] must be finite`);
    }
    return value;
  });
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm <= Number.EPSILON) {
    fail("invalid_sface_embedding", "SFace embedding must be non-zero");
  }
  return Object.freeze(vector.map((value) => value / norm));
}

export async function runOpenCvSFaceLabInferenceV1({
  modelPath,
  imagePath,
  faceBox,
  pythonBin = "python3",
  runner = spawnSync,
} = {}) {
  const normalizedFaceBox = normalizeSFaceFaceBoxV1(faceBox);
  const inspection = await inspectOpenCvSFaceArtifactV1({ modelPath });
  if (!inspection.sourceIntegrityVerified) {
    fail("sface_source_integrity_mismatch", "local SFace artifact does not match the pinned digest and size");
  }
  await regularFile(imagePath, "imagePath");

  const admission = admissionFor(true);
  if (admission.labInferenceEligible !== true) {
    fail("sface_admission_not_eligible", "SFace artifact is not eligible for lab inference");
  }

  const runtimePath = fileURLToPath(new URL("./sface-lab-runtime-v1.py", import.meta.url));
  const result = runner(
    pythonBin,
    [
      runtimePath,
      "--model",
      modelPath,
      "--image",
      imagePath,
      "--face-box-json",
      JSON.stringify(normalizedFaceBox),
    ],
    { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, env: process.env },
  );

  if (!result || result.error || result.status !== 0) {
    fail("sface_runtime_failed", "OpenCV SFace lab runtime failed");
  }

  let payload;
  try {
    payload = JSON.parse(String(result.stdout ?? ""));
  } catch {
    fail("invalid_sface_runtime_output", "SFace runtime did not return valid JSON");
  }
  if (typeof payload?.cvVersion !== "string" || !payload.cvVersion.trim()) {
    fail("invalid_sface_runtime_output", "SFace runtime must report cvVersion");
  }
  if (payload.embeddingDim !== TRUST_FACE_SFACE_LAB_INFERENCE_V1.embeddingDim) {
    fail(
      "invalid_sface_runtime_output",
      `SFace runtime must report embeddingDim=${TRUST_FACE_SFACE_LAB_INFERENCE_V1.embeddingDim}`,
    );
  }

  const modelVersion =
    `${TRUST_FACE_SFACE_LAB_INFERENCE_V1.modelId}@${TRUST_FACE_SFACE_LAB_INFERENCE_V1.sourceRevision}`;

  return Object.freeze({
    version: TRUST_FACE_SFACE_LAB_INFERENCE_V1.version,
    mode: "lab-only",
    provider: TRUST_FACE_SFACE_LAB_INFERENCE_V1.provider,
    modelVersion,
    embeddingDim: TRUST_FACE_SFACE_LAB_INFERENCE_V1.embeddingDim,
    requiredProductEmbeddingDim: TRUST_FACE_SFACE_LAB_INFERENCE_V1.requiredProductEmbeddingDim,
    productEmbeddingDimCompatible: admission.productEmbeddingDimCompatible,
    weightsDigest: TRUST_FACE_SFACE_LAB_INFERENCE_V1.weightsDigest,
    admissionDigest: admission.admissionDigest,
    cvVersion: payload.cvVersion.trim(),
    alignedWithFiveLandmarks: payload.alignedWithFiveLandmarks === true,
    embedding: Object.freeze({
      modelVersion,
      vector: normalizeEmbedding(payload.embedding),
    }),
    embeddingStored: false,
    rawBiometricPayloadAccepted: false,
    rawBiometricPayloadStored: false,
    modelWeightsStoredByReceipt: false,
    decisionCreated: false,
    labInferenceEligible: admission.labInferenceEligible,
    productUseEligible: admission.productUseEligible,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
