import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createExternalTrainedBackboneAdmissionV1 } from "./external-trained-backbone-admission-v1.mjs";
import { createFaceEmbedding } from "./index.mjs";

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
  embeddingDim: 512,
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

function fail(code, message) {
  throw new TrustFaceSFaceLabInferenceV1Error(code, message);
}

function requiredPath(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_lab_path", `${field} is required`);
  }
  if (value.includes("\0")) {
    fail("invalid_lab_path", `${field} contains a null byte`);
  }
  return value.trim();
}

async function assertRegularFile(path, field) {
  let info;
  try {
    info = await stat(path);
  } catch {
    fail("lab_file_not_found", `${field} does not exist`);
  }
  if (!info.isFile()) {
    fail("invalid_lab_file", `${field} must be a regular file`);
  }
  return info;
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
  const normalized = values.map((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail("invalid_face_box", `faceBox[${index}] must be finite`);
    }
    return value;
  });
  if (normalized[2] <= 0 || normalized[3] <= 0) {
    fail("invalid_face_box", "faceBox width and height must be positive");
  }
  return Object.freeze(normalized.slice(0, 14));
}

export async function inspectOpenCvSFaceArtifactV1({ modelPath } = {}) {
  const path = requiredPath(modelPath, "modelPath");
  const info = await assertRegularFile(path, "modelPath");
  const actualDigest = await sha256File(path);
  const digestMatches = actualDigest === TRUST_FACE_SFACE_LAB_INFERENCE_V1.weightsDigest;
  const sizeMatches = info.size === TRUST_FACE_SFACE_LAB_INFERENCE_V1.artifactBytes;

  return Object.freeze({
    version: "trust-face-sface-artifact-inspection/v1",
    modelId: TRUST_FACE_SFACE_LAB_INFERENCE_V1.modelId,
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

function createAdmissionFromInspection(inspection) {
  return createExternalTrainedBackboneAdmissionV1({
    modelId: TRUST_FACE_SFACE_LAB_INFERENCE_V1.modelId,
    modelFamily: TRUST_FACE_SFACE_LAB_INFERENCE_V1.modelFamily,
    artifactFormat: TRUST_FACE_SFACE_LAB_INFERENCE_V1.artifactFormat,
    sourceRepository: TRUST_FACE_SFACE_LAB_INFERENCE_V1.sourceRepository,
    sourcePath: TRUST_FACE_SFACE_LAB_INFERENCE_V1.sourcePath,
    sourceRevision: TRUST_FACE_SFACE_LAB_INFERENCE_V1.sourceRevision,
    weightsDigest: TRUST_FACE_SFACE_LAB_INFERENCE_V1.weightsDigest,
    licenseSpdx: TRUST_FACE_SFACE_LAB_INFERENCE_V1.licenseSpdx,
    licenseEvidenceRef: TRUST_FACE_SFACE_LAB_INFERENCE_V1.licenseEvidenceRef,
    trainingDataProvenanceStatus: TRUST_FACE_SFACE_LAB_INFERENCE_V1.trainingDataProvenanceStatus,
    commercialUseClarified: TRUST_FACE_SFACE_LAB_INFERENCE_V1.commercialUseClarified,
    authenticationUseClarified: TRUST_FACE_SFACE_LAB_INFERENCE_V1.authenticationUseClarified,
    independentValidationStatus: TRUST_FACE_SFACE_LAB_INFERENCE_V1.independentValidationStatus,
    evaluationDigest: null,
    embeddingDim: TRUU5T_FACE_SFACE_LAB_INFERENCE_V1.mbeddingDim,
    alignmentLandmarks: TRUST_FACE_SFACE_LAB_INFERENCE_V1.alignmentLandmarks,
    sourceIntegrityVerified: inspection.sourceIntegrityVerified === true,
  });
}

export function parseSFaceRuntimeResultV1({ stdout, admission } = {}) {
  if (!admission || admission.labInferenceEligible !== true || admission.sourceIntegrityVerified !== true) {
    fail("sface_admission_not_eligible", "SFace lab inference requires an integrity-verified admission");
  }

  let payload;
  try {
    payload = JSON.parse(String(stdout ?? ""));
  } catch {
    fail("invalid_sface_runtime_output", "SFace runtime did not return valid JSON");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    fail("invalid_sface_runtime_output", "SFace runtime output must be an object");
  }
  if (!Array.isArray(payload.embedding) || payload.embedding.length !== TRUST_FACE_SFACE_LAB_INFERENCE_V1.embeddingDim) {
    fail("invalid_sface_embedding", "SFace runtime must return a 512D embedding");
  }
  if (typeof payload.cvVersion !== "string" || !payload.cvVersion.trim()) {
    fail("invalid_sface_runtime_output", "SFace runtime must report cvVersion");
  }

  const embedding = createFaceEmbedding({
    values: payload.embedding,
    modelVersion:
      `${TRUST_FACE_SFACE_LAB_INFERENCE_V1.modelId}@${TRUST_FACE_SFACE_LAB_INFERENCE_V1.sourceRevision}`,
  });

  return Object.freeze({
    version: TRUST_FACE_SFACE_LAB_INFERENCE_V1.version,
    mode: "lab-only",
    provider: TRUST_FACE_SFACE_LAB_INFERENCE_V1.provider,
    modelId: TRUST_FACE_SFACE_LAB_INFERENCE_V1.modelId,
    sourceRevision: TRUST_FACE_SFACE_LAB_INFERENCE_V1.sourceRevision,
    weightsDigest: TRUST_FACE_SFACE_LAB_INFERENCE_V1.weightsDigest,
    admissionDigest: admission.admissionDigest,
    cvVersion: payload.cvVersion.trim(),
    alignedWithFiveLandmarks: payload.alignedWithFiveLandmarks === true,
    embedding,
    embeddingStored: false,
    rawBiometricPayloadAccepted: false,
    rawBiometricPayloadStored: false,
    modelWeightsStoredByReceipt: false,
    decisionCreated: false,
    productUseEligible: admission.productUseEligible === true,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export async function runOpenCvSFaceLabInferenceV1({
  modelPath,
  imagePath,
  faceBox,
  pythonBin = "python3",
  runner = spawnSync,
} = {}) {
  const model = requiredPath(modelPath, "modelPath");
  const image = requiredPath(imagePath, "imagePath");
  const normalizedFaceBox = normalizeSFaceFaceBoxV1(faceBox);
  const inspection = await inspectOpenCvSFaceArtifactV1({ modelPath: model });

  if (!inspection.sourceIntegrityVerified) {
    fail("sface_source_integrity_mismatch", "local SFace artifact does not match the pinned digest and size");
  }
  await assertRegularFile(image, "imagePath");

  const admission = createAdmissionFromInspection(inspection);
  if (admission.labInferenceEligible !== true) {
    fail("sface_admission_not_eligible", "SFace artifact is not eligible for lab inference");
  }

  const runtimePath = fileURLToPath(new URL("./sface-lab-runtime-v1.py", import.meta.url));
  const result = runner(
    pythonBin,
    [
      runtimePath,
      "--model",
      model,
      "--image",
      image,
      "--face-box-json",
      JSON.stringify(normalizedFaceBox),
    ],
    {
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
      env: process.env,
    },
  );

  if (!result || result.error || result.status !== 0) {
    fail("sface_runtime_failed", "OpenCV SFace lab runtime failed");
  }

  return parseSFaceRuntimeResultV1({ stdout: result.stdout, admission });
}
