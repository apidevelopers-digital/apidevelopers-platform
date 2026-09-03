
export const TRUST_FACE_IMAGE_DESCRIPTOR_BASELINE_V1 = Object.freeze({
  version: "trust-face-image-descriptor-baseline/v1",
  modelVersion: "trust-face-image-descriptor/dct-lab-v1",
  mode: "lab-deterministic",
  inputShape: Object.freeze({ width: 112, height: 112, channels: 3 }),
  embeddingDim: 512,
  scoreCompatibility: "cosine",
  trainedBiometricWeightsIncluded: false,
  realBiometricModel: false,
  independentlyValidated: false,
  embeddingStored: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceImageDescriptorBaselineV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceImageDescriptorBaselineV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceImageDescriptorBaselineV1Error(code, message);
};

function validateExecution(execution) {
  const mode = execution?.mode ?? "lab";
  if (mode !== "lab") fail("production_not_authorized", "image descriptor baseline is lab-only");
  if (execution?.realBiometricModel === true || execution?.productionAuthorized === true) {
    fail("production_not_authorized", "lab baseline cannot authorize production biometric execution");
  }
}

function validateSample(sample) {
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
    fail("invalid_sample", "sample object is required");
  }
  if (sample.width !== 112 || sample.height !== 112 || sample.channels !== 3) {
    fail("invalid_sample_shape", "sample must be aligned 112x112 RGB");
  }
  const pixels = sample.pixels;
  if (!Array.isArray(pixels) && !(pixels instanceof Float32Array) && !(pixels instanceof Uint8Array)) {
    fail("invalid_sample_pixels", "sample.pixels must be an array-like numeric vector");
  }
  if (pixels.length !== 112 * 112 * 3) {
    fail("invalid_sample_pixels", "sample.pixels must contain 37632 RGB values");
  }
  const gray = new Float64Array(112 * 112);
  let sum = 0;
  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 1) {
    const r = Number(pixels[i]);
    const g = Number(pixels[i + 1]);
    const b = Number(pixels[i + 2]);
    if (![r, g, b].every(Number.isFinite)) fail("invalid_sample_pixel", "pixels must be finite");
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
      fail("invalid_sample_pixel", "pixels must be in [0,255]");
    }
    const value = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    gray[j] = value;
    sum += value;
  }
  const mean = sum / gray.length;
  let variance = 0;
  for (let i = 0; i < gray.length; i += 1) {
    const delta = gray[i] - mean;
    variance += delta * delta;
  }
  const std = Math.sqrt(variance / gray.length);
  if (!(std > 1e-6)) fail("insufficient_sample_contrast", "aligned face sample must have non-zero contrast");
  for (let i = 0; i < gray.length; i += 1) gray[i] = (gray[i] - mean) / std;
  return gray;
}

function zigZagPairs(count) {
  const pairs = [];
  for (let sum = 1; pairs.length < count && sum < 224; sum += 1) {
    const start = Math.max(0, sum - 111);
    const end = Math.min(111, sum);
    for (let u = start; u <= end && pairs.length < count; u += 1) {
      const v = sum - u;
      pairs.push([u, v]);
    }
  }
  return pairs;
}

const PAIRS = Object.freeze(zigZagPairs(512).map((pair) => Object.freeze(pair)));
const MAX_FREQ = Math.max(...PAIRS.flat());
const COS = Object.freeze(
  Array.from({ length: MAX_FREQ + 1 }, (_, k) =>
    Object.freeze(Array.from({ length: 112 }, (_, x) => Math.cos((Math.PI * (2 * x + 1) * k) / 224))),
  ),
);

function descriptor(gray) {
  const out = new Float64Array(512);
  for (let index = 0; index < PAIRS.length; index += 1) {
    const [u, v] = PAIRS[index];
    const cosX = COS[u];
    const cosY = COS[v];
    let acc = 0;
    for (let y = 0; y < 112; y += 1) {
      const cy = cosY[y];
      const row = y * 112;
      for (let x = 0; x < 112; x += 1) {
        acc += gray[row + x] * cosX[x] * cy;
      }
    }
    out[index] = acc;
  }
  let norm2 = 0;
  for (const value of out) norm2 += value * value;
  const norm = Math.sqrt(norm2);
  if (!(norm > Number.EPSILON)) fail("zero_descriptor", "descriptor norm must be positive");
  return Object.freeze(Array.from(out, (value) => value / norm));
}

export function createLabImageDescriptorEmbedding({
  sample,
  execution = { mode: "lab", realBiometricModel: false, productionAuthorized: false },
} = {}) {
  validateExecution(execution);
  const vector = descriptor(validateSample(sample));
  return Object.freeze({
    profileVersion: TRUST_FACE_IMAGE_DESCRIPTOR_BASELINE_V1.version,
    modelVersion: TRUST_FACE_IMAGE_DESCRIPTOR_BASELINE_V1.modelVersion,
    authorityBasis: "deterministic-lab-descriptor",
    embeddingDim: 512,
    vector,
    trainedBiometricWeightsIncluded: false,
    realBiometricModel: false,
    independentlyValidated: false,
    embeddingStored: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
