import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const TRUST_FACE_YUNET_LAB_DETECTION_V1 = Object.freeze({
  version: "trust-face-yunet-lab-detection/v1",
  mode: "lab-only",
  provider: "OpenCV FaceDetectorYN",
  modelId: "opencv-yunet-2023mar",
  modelFamily: "YuNet",
  artifactFormat: "onnx",
  sourceRepository: "https://github.com/opencv/opencv_zoo",
  sourceRevision: "47534e27c9851bb1128ccc0102f1145e27f23f98",
  sourcePath: "models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
  weightsDigest: "sha256:8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
  artifactBytes: 232589,
  alignmentLandmarks: 5,
  detectorOutputValues: 15,
  scoreThreshold: 0.9,
  nmsThreshold: 0.3,
  topK: 5000,
  autoDownload: false,
  productionAuthorized: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceYuNetLabDetectionV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceYuNetLabDetectionV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceYuNetLabDetectionV1Error(code, message);
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
    if (error instanceof TrustFaceYuNetLabDetectionV1Error) throw error;
    fail("lab_file_not_found", `${field} does not exist`);
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on( "data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}

export async function inspectOpenCvYuNetArtifactV1({ modelPath } = {}) {
  const info = await regularFile(modelPath, "modelPath");
  const actualDigest = await sha256File(modelPath);
  const digestMatches = actualDigest === TRUST_FACE_YUNET_LAB_DETECTION_V1.weightsDigest;
  const sizeMatches = info.size === TRUST_FACE_YUNET_LAB_DETECTION_V1.artifactBytes;
  return Object.freeze({
    version: "trust-face-yunet-artifact-inspection/v1",
    expectedDigest: TRUST_FACE_YUNET_LAB_DETECTION_V1.weightsDigest,
    actualDigest,
    expectedBytes: TRUST_FACE_YUNET_LAB_DETECTION_V1.artifactBytes,
    actualBytes: info.size,
    digestMatches,
    sizeMatches,
    sourceIntegrityVerified: digestMatches && sizeMatches,
    modelWeightsStoredByReceipt: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function normalizeYuNetFaceBoxV1(faceBox) {
  if (!Array.isArray(faceBox)) fail("invalid_yunet_face_box", "faceBox must be an array");
  if (faceBox.length !== TRUST_FACE_YUNET_LAB_DETECTION_V1.detectorOutputValues) {
    fail("invalid_yunet_face_box", "YuNet faceBox must contain 15 values");
  }
  const values = faceBox.map((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail("invalid_yunet_face_box", `faceBox[${index}] must be finite`);
    }
    return value;
  });
  if (values[2] <= 0 || values[3] <= 0) fail("invalid_yunet_face_box", "bbox width and height must be positive");
  if (values[14] < 0 || values[14] > 1) fail("invalid_yunet_face_box", "detector score must be in [0,1]");
  return Object.freeze(values);
}

export function parseYuNetRuntimeResultV1({ stdout } = {}) {
  let payload;
  try {
    payload = JSON.parse(String(stdout ?? ""));
  } catch {
    fail("invalid_yunet_runtime_output", "YuNet runtime did not return valid JSON");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    fail("invalid_yunet_runtime_output", "YuNet runtime output must be an object");
  }
  if (typeof payload.cvVersion !== "string" || !payload.cvVersion.trim()) {
    fail("invalid_yunet_runtime_output", "YuNet runtime must report cvVersion");
  }
  if (!Number.isInteger(payload.detectionCount) || payload.detectionCount < 1) {
    fail("invalid_yunet_runtime_output", "YuNet runtime must report at least one detected face");
  }
  const faceBox = normalizeYuNetFaceBoxV1(payload.faceBox);
  return Object.freeze({
    version: TRUST_FACE_YUNET_LAB_DETECTION_V1.version,
    mode: "lab-only",
    provider: TRUST_FACE_YUNET_LAB_DETECTION_V1.provider,
    modelId: TRUST_FACE_YUNET_LAB_DETECTION_V1.modelId,
    cvVersion: payload.cvVersion.trim(),
    detectionCount: payload.detectionCount,
    selectedScore: faceBox[14],
    faceBox,
    alignmentLandmarks: 5,
    rawBiometricPayloadStored: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export async function runOpenCvYuNetLabDetectionV1({
  modelPath,
  imagePath,
  pythonBin = "python3",
  runner = spawnSync,
} = {}) {
  const inspection = await inspectOpenCvYuNetArtifactV1({ modelPath });
  if (!inspection.sourceIntegrityVerified) {
    fail("yunet_source_integrity_mismatch", "local YuNet artifact does not match the pinned digest and size");
  }
  await regularFile(imagePath, "imagePath");

  const runtimePath = fileURLToPath(new URL("./yunet-lab-runtime-v1.py", import.meta.url));
  const profile = TRUST_FACE_YUNET_LAB_DETECTION_V1;
  const result = runner(
    pythonBin,
    [
      runtimePath,
      "--model", modelPath,
      "--image", imagePath,
      "--score-threshold", String(profile.scoreThreshold),
      "--nms-threshold", String(profile.nmsThreshold),
      "--top-k", String(profile.topK),
    ],
    { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, env: process.env },
  );

  if (!result || result.error || result.status !== 0) {
    fail("yunet_runtime_failed", "OpenCV YuNet lab runtime failed");
  }
  return Object.freeze({
    ...parseYuNetRuntimeResultV1({ stdout: result.stdout }),
    sourceIntegrityVerified: true,
    weightsDigest: profile.weightsDigest,
  });
}
