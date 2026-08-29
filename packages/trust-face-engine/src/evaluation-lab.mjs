import { detectFaceLandmarks } from "./detector-landmarks-lab.mjs";
import { alignFaceFromLandmarks } from "./alignment-lab.mjs";
import { createLabFaceEmbeddingFromGrayImage } from "./lab-baseline.mjs";
import { evaluateVerification } from "./metric-lab.mjs";

export const TRUST_FACE_EVALUATION_LAB_PROFILE = Object.freeze({
  version: "trust-face-evaluation/v0-lab",
  productionReady: false,
  biometricClaimReady: false,
  requiresPermittedDataset: true,
  rawBiometricLogging: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceEvaluationLabError";
  error.code = code;
  throw error;
}

function validateDataset(dataset) {
  if (!dataset || typeof dataset !== "object" || !Array.isArray(dataset.samples)) {
    fail("invalid_dataset", "dataset.samples is required");
  }
  if (!dataset.authority || typeof dataset.authority !== "object") {
    fail("invalid_dataset_authority", "dataset.authority is required");
  }
  const basis = dataset.authority.basis;
  if (!["synthetic", "public-licensed", "consented-lab"].includes(basis)) {
    fail("unsupported_dataset_authority", "dataset authority must be synthetic, public-licensed, or consented-lab");
  }
  return dataset;
}

function nme(predicted, expected) {
  const keys = ["leftEye", "rightEye", "nose", "mouthLeft", "mouthRight"];
  const norm = Math.max(1e-9, Math.hypot(
    expected.rightEye.x - expected.leftEye.x,
    expected.rightEye.y - expected.leftEye.y,
  ));
  let sum = 0;
  for (const key of keys) {
    sum += Math.hypot(
      predicted[key].x - expected[key].x,
      predicted[key].y - expected[key].y,
    ) / norm;
  }
  return sum / keys.length;
}

function detectorMetrics(records) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  const landmarkErrors = [];
  for (const record of records) {
    const expected = record.sample.facePresent;
    const predicted = record.detection.facePresent;
    if (expected && predicted) tp += 1;
    else if (!expected && predicted) fp += 1;
    else if (!expected && !predicted) tn += 1;
    else fn += 1;

    if (expected && predicted && record.sample.landmarks && record.detection.landmarks) {
      landmarkErrors.push(nme(record.detection.landmarks, record.sample.landmarks));
    }
  }

  return Object.freeze({
    samples: records.length,
    tp, fp, tn, fn,
    precision: tp + fp ? tp / (tp + fp) : 0,
    recall: tp + fn ? tp / (tp + fn) : 0,
    specificity: tn + fp ? tn / (tn + fp) : 0,
    landmarkNme: landmarkErrors.length
      ? landmarkErrors.reduce((sum, value) => sum + value, 0) / landmarkErrors.length
      : null,
    landmarkEvaluatedSamples: landmarkErrors.length,
  });
}

function sampleEmbeddings(records) {
  const map = new Map();
  for (const record of records) {
    if (!record.sample.facePresent || !record.detection.facePresent || !record.detection.landmarks) continue;

    const aligned = alignFaceFromLandmarks({
      width: record.sample.width,
      height: record.sample.height,
      pixels: record.sample.pixels,
      landmarks: record.detection.landmarks,
    });
    if (!aligned.quality.passed) continue;

    const baseline = createLabFaceEmbeddingFromGrayImage({
      width: aligned.width,
      height: aligned.height,
      pixels: aligned.pixels,
    });

    // Keep the baseline vector here. evaluateVerification/scoreVerificationPair
    // is the single authority that applies metricModel weights.
    map.set(record.sample.sampleId, baseline.vector);
  }
  return map;
}

export function evaluateTrustFacePipeline({
  detectorModel,
  metricModel,
  dataset,
  verificationPairs,
  thresholds = [0.5, 0.6, 0.7, 0.8, 0.9],
} = {}) {
  const normalized = validateDataset(dataset);
  if (!detectorModel) fail("detector_model_required", "detectorModel is required");
  if (!metricModel) fail("metric_model_required", "metricModel is required");
  if (!Array.isArray(verificationPairs) || verificationPairs.length < 2) {
    fail("verification_pairs_required", "verificationPairs must contain at least two pairs");
  }

  const records = normalized.samples.map((sample, index) => {
    if (!sample || typeof sample !== "object" || typeof sample.sampleId !== "string") {
      fail("invalid_evaluation_sample", `samples[${index}] is invalid`);
    }
    const detection = detectFaceLandmarks({
      model: detectorModel,
      width: sample.width,
      height: sample.height,
      pixels: sample.pixels,
    });
    return Object.freeze({ sample, detection });
  });

  const detection = detectorMetrics(records);
  const embeddings = sampleEmbeddings(records);
  const pairs = verificationPairs.map((pair, index) => {
    const referenceVector = embeddings.get(pair.referenceSampleId);
    const probeVector = embeddings.get(pair.probeSampleId);
    if (!referenceVector || !probeVector) {
      fail("pair_embedding_unavailable", `verificationPairs[${index}] references a sample without usable embedding`);
    }
    return Object.freeze({
      sameSubject: Boolean(pair.sameSubject),
      referenceVector,
      probeVector,
    });
  });

  const verification = evaluateVerification({ model: metricModel, pairs, thresholds });

  return Object.freeze({
    profile: TRUST_FACE_EVALUATION_LAB_PROFILE,
    dataset: Object.freeze({
      datasetId: normalized.datasetId ?? null,
      authorityBasis: normalized.authority.basis,
      sampleCount: normalized.samples.length,
    }),
    detection,
    verification,
    productionReady: false,
    biometricClaimReady: false,
  });
}
