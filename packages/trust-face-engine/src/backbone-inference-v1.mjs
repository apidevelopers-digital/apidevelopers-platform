import { createHash } from "node:crypto";

export const TRUST_FACE_BACKBONE_INFERENCE_V1 = Object.freeze({
  version: "trust-face-backbone-inference/v1",
  authorityBasis: "synthetic",
  inputShape: Object.freeze({ width: 112, height: 112, channels: 3 }),
  stageWidths: Object.freeze([64, 96, 160, 256]),
  stageDepths: Object.freeze([1, 2, 3, 2]),
  blockCount: 8,
  embeddingDim: 512,
  checkpointClass: "deterministic-synthetic",
  trainedBiometricWeightsIncluded: false,
  syntheticInferenceReady: true,
  realBiometricInferenceAuthorized: false,
  biometricBackboneReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceBackboneInferenceV1Error";
  error.code = code;
  throw error;
}

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function zeros(n) {
  return Array.from({ length: n }, () => 0);
}

function matrix(rows, cols, fn) {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => fn(r, c)));
}

function matVec(w, x) {
  return w.map((row) => row.reduce((sum, value, i) => sum + value * x[i], 0));
}

function relu(x) {
  return x > 0 ? x : 0;
}

function l2(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0) + 1e-12);
}

function normalize(vector) {
  const norm = l2(vector);
  return Object.freeze(vector.map((value) => value / norm));
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function validateSample(sample) {
  if (!sample || sample.width !== 112 || sample.height !== 112 || sample.channels !== 3) {
    fail("invalid_sample_shape", "sample must be 112x112 RGB");
  }
  if (!Array.isArray(sample.pixels) || sample.pixels.length !== 112 * 112 * 3) {
    fail("invalid_sample_pixels", "sample must contain 37632 pixels");
  }
  for (const value of sample.pixels) {
    if (!Number.isFinite(value)) fail("invalid_sample_pixel", "pixels must be finite numbers");
  }
}

function extract12(sample) {
  const features = zeros(12);
  for (let c = 0; c < 3; c += 1) {
    for (let qy = 0; qy < 2; qy += 1) {
      for (let qx = 0; qx < 2; qx += 1) {
        let sum = 0;
        let count = 0;
        const y0 = qy * 56;
        const y1 = (qy + 1) * 56;
        const x0 = qx * 56;
        const x1 = (qx + 1) * 56;
        for (let y = y0; y < y1; y += 8) {
          for (let x = x0; x < x1; x += 8) {
            sum += sample.pixels[(y * 112 + x) * 3 + c];
            count += 1;
          }
        }
        features[c * 4 + qy * 2 + qx] = sum / Math.max(1, count);
      }
    }
  }
  return features;
}

export function createSyntheticBackboneCheckpoint({ seed = 101 } = {}) {
  if (!Number.isInteger(seed)) fail("invalid_seed", "seed must be an integer");
  const random = rng(seed);
  const small = (fanIn) => (random() - 0.5) * (2 / Math.sqrt(fanIn));

  const stem = matrix(64, 12, () => small(12));
  const blocks = [];
  const widths = TRUST_FACE_BACKBONE_INFERENCE_V1.stageWidths;
  const depths = TRUST_FACE_BACKBONE_INFERENCE_V1.stageDepths;
  let currentDim = 64;

  for (let stage = 0; stage < widths.length; stage += 1) {
    for (let block = 0; block < depths[stage]; block += 1) {
      const outDim = widths[stage];
      blocks.push(Object.freeze({
        stage,
        block,
        inDim: currentDim,
        outDim,
        main: matrix(outDim, currentDim, () => small(currentDim)),
        skip: currentDim === outDim ? null : matrix(outDim, currentDim, () => small(currentDim)),
        bias: zeros(outDim),
      }));
      currentDim = outDim;
    }
  }

  const projection = matrix(512, currentDim, () => small(currentDim));
  const payload = { seed, stem, blocks, projection };
  return Object.freeze({
    version: "trust-face-backbone-checkpoint/synthetic-v1",
    authorityBasis: "synthetic",
    seed,
    embeddingDim: 512,
    blockCount: blocks.length,
    trainedBiometricWeightsIncluded: false,
    checkpointDigest: sha256(payload),
    stem,
    blocks: Object.freeze(blocks),
    projection,
  });
}

export function inferSyntheticBackboneEmbedding({
  sample,
  checkpoint,
  execution = { mode: "synthetic", realBiometricInferenceAuthorized: false },
} = {}) {
  validateSample(sample);
  if (!checkpoint || checkpoint.version !== "trust-face-backbone-checkpoint/synthetic-v1") {
    fail("invalid_checkpoint", "synthetic backbone checkpoint v1 is required");
  }

  const mode = execution?.mode ?? "synthetic";
  if (!["synthetic", "consented-real"].includes(mode)) {
    fail("invalid_execution_mode", "execution.mode must be synthetic or consented-real");
  }
  if (mode === "consented-real") {
    fail(
      "real_biometric_inference_not_ready",
      "consented-real inference is blocked because this checkpoint contains no trained biometric weights",
    );
  }

  const features = extract12(sample);
  const stemPre = matVec(checkpoint.stem, features);
  let x = stemPre.map(relu);

  for (const block of checkpoint.blocks) {
    const main = matVec(block.main, x);
    const skip = block.skip ? matVec(block.skip, x) : [...x];
    const out = zeros(block.outDim);
    for (let i = 0; i < block.outDim; i += 1) {
      out[i] = relu(main[i] + skip[i] + block.bias[i]);
    }
    x = out;
  }

  const raw = matVec(checkpoint.projection, x);
  const embedding = normalize(raw);

  return Object.freeze({
    profileVersion: TRUST_FACE_BACKBONE_INFERENCE_V1.version,
    authorityBasis: "synthetic",
    executionMode: mode,
    checkpointDigest: checkpoint.checkpointDigest,
    embedding,
    embeddingDim: embedding.length,
    embeddingNormApproximatelyOne: Math.abs(l2(embedding) - 1) < 1e-9,
    trainedBiometricWeightsIncluded: false,
    biometricBackboneReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
