
export const TRUST_FACE_DETECTOR_LAB_PROFILE = Object.freeze({
  version: "trust-face-detector-landmarks/v0-lab",
  productionReady: false,
  biometricClaimReady: false,
  livenessPad: false,
  trainedModel: true,
  detectorKind: "prototype-distance-baseline",
  landmarkCount: 5,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceDetectorLabError";
  error.code = code;
  throw error;
}

function assertImage({ width, height, pixels }, field = "image") {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16) {
    fail("invalid_image_dimensions", `${field} dimensions are invalid`);
  }
  if (!(pixels instanceof Uint8Array) || pixels.length !== width * height) {
    fail("invalid_image_pixels", `${field}.pixels must be Uint8Array(width*height)`);
  }
}

function featureVector(image, grid = 8) {
  assertImage(image);
  const { width, height, pixels } = image;
  const features = [];
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const x0 = Math.floor((gx * width) / grid);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / grid));
      const y0 = Math.floor((gy * height) / grid);
      const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / grid));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < Math.min(y1, height); y += 1) {
        for (let x = x0; x < Math.min(x1, width); x += 1) {
          sum += pixels[y * width + x];
          count += 1;
        }
      }
      features.push((sum / Math.max(1, count)) / 255);
    }
  }
  const mean = features.reduce((a, b) => a + b, 0) / features.length;
  const centered = features.map((v) => v - mean);
  const norm = Math.sqrt(centered.reduce((sum, v) => sum + v * v, 0));
  if (norm < 1e-9) fail("image_has_no_signal", "image has insufficient spatial signal");
  return centered.map((v) => v / norm);
}

function distance(a, b) {
  if (a.length !== b.length) fail("feature_dimension_mismatch", "feature vectors must share dimensions");
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function average(vectors) {
  const out = new Array(vectors[0].length).fill(0);
  for (const vector of vectors) for (let i = 0; i < vector.length; i += 1) out[i] += vector[i];
  return out.map((value) => value / vectors.length);
}

function normalizeLandmarks(landmarks, width, height, field) {
  const keys = ["leftEye", "rightEye", "nose", "mouthLeft", "mouthRight"];
  if (!landmarks || typeof landmarks !== "object") fail("invalid_landmarks", `${field} landmarks are required`);
  const out = {};
  for (const key of keys) {
    const point = landmarks[key];
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height) {
      fail("invalid_landmarks", `${field}.${key} is invalid`);
    }
    out[key] = Object.freeze({ x: x / width, y: y / height });
  }
  return Object.freeze(out);
}

export function trainDetectorLandmarkModel({
  samples,
  modelVersion = "trust-face-detector-landmarks/v0-lab",
} = {}) {
  if (!Array.isArray(samples) || samples.length < 6) {
    fail("insufficient_training_samples", "at least six labeled samples are required");
  }
  if (typeof modelVersion !== "string" || !modelVersion.trim()) fail("invalid_model_version", "modelVersion is required");

  const positives = [];
  const negatives = [];
  samples.forEach((sample, index) => {
    if (!sample || typeof sample !== "object" || typeof sample.facePresent !== "boolean") {
      fail("invalid_training_sample", `samples[${index}] is invalid`);
    }
    assertImage(sample, `samples[${index}]`);
    const features = featureVector(sample);
    if (sample.facePresent) {
      positives.push(Object.freeze({
        features: Object.freeze(features),
        landmarks: normalizeLandmarks(sample.landmarks, sample.width, sample.height, `samples[${index}]`),
      }));
    } else {
      negatives.push(Object.freeze({ features: Object.freeze(features) }));
    }
  });

  if (positives.length < 3 || negatives.length < 3) {
    fail("insufficient_class_balance", "training requires at least three positive and three negative samples");
  }

  return Object.freeze({
    profile: TRUST_FACE_DETECTOR_LAB_PROFILE,
    modelVersion: modelVersion.trim(),
    featureGrid: 8,
    positiveCentroid: Object.freeze(average(positives.map((v) => v.features))),
    negativeCentroid: Object.freeze(average(negatives.map((v) => v.features))),
    positivePrototypes: Object.freeze(positives),
    trainingSummary: Object.freeze({
      sampleCount: samples.length,
      positiveCount: positives.length,
      negativeCount: negatives.length,
    }),
  });
}

export function detectFaceLandmarks({ model, width, height, pixels, neighbors = 3 } = {}) {
  if (!model || typeof model !== "object" || !Array.isArray(model.positiveCentroid) || !Array.isArray(model.negativeCentroid)) {
    fail("invalid_detector_model", "trained detector model is required");
  }
  const image = { width, height, pixels };
  const features = featureVector(image, model.featureGrid ?? 8);
  const positiveDistance = distance(features, model.positiveCentroid);
  const negativeDistance = distance(features, model.negativeCentroid);
  const facePresent = positiveDistance < negativeDistance;
  const confidence = (Math.abs(negativeDistance - positiveDistance) / Math.max(1e-9, positiveDistance + negativeDistance));

  if (!facePresent) {
    return Object.freeze({
      facePresent: false,
      confidence,
      landmarks: null,
      modelVersion: model.modelVersion,
      productionReady: false,
      biometricClaimReady: false,
    });
  }

  const ranked = model.positivePrototypes
    .map((prototype) => ({ prototype, d: distance(features, prototype.features) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.max(1, Math.min(neighbors, model.positivePrototypes.length)));

  const keys = ["leftEye", "rightEye", "nose", "mouthLeft", "mouthRight"];
  const landmarks = {};
  for (const key of keys) {
    let totalWeight = 0;
    let x = 0;
    let y = 0;
    for (const entry of ranked) {
      const weight = 1 / Math.max(1e-6, entry.d);
      totalWeight += weight;
      x += entry.prototype.landmarks[key].x * weight;
      y += entry.prototype.landmarks[key].y * weight;
    }
    landmarks[key] = Object.freeze({
      x: (x / totalWeight) * width,
      y: (y / totalWeight) * height,
    });
  }

  return Object.freeze({
    facePresent: true,
    confidence,
    landmarks: Object.freeze(landmarks),
    modelVersion: model.modelVersion,
    productionReady: false,
    biometricClaimReady: false,
  });
}
