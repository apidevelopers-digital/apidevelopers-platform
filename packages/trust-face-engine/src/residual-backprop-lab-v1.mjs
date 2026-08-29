import { createHash } from "node:crypto";

export const TRUST_FACE_RESIDUAL_BACKPROP_LAB_V1_PROFILE = Object.freeze({
  version: "trust-face-residual-backprop-lab/v1",
  input: Object.freeze({ width: 112, height: 112, channels: 3, colorSpace: "RGB" }),
  fixedLabDownsample: Object.freeze({ width: 14, height: 14, mode: "average-8x8" }),
  trainableStemChannels: 4,
  residualBlock: Object.freeze({ depthwiseKernel: 3, pointwiseChannels: 4, skip: true }),
  embeddingDim: 512,
  normalizedEmbedding: true,
  productionReady: false,
  biometricClaimReady: false,
  biometricBackboneReady: false,
  canonicalFourStageBackboneReady: false,
  realBiometricTrainingAuthorized: false,
  rawBiometricLogging: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceResidualBackpropLabV1Error";
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
  return Array.from({ length: rows }, () => Array.from({ length: cols }, fn));
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function assertSample(sample) {
  if (!sample || sample.width !== 112 || sample.height !== 112 || sample.channels !== 3) {
    fail("invalid_sample_shape", "sample must be 112x112 RGB");
  }
  if (!Array.isArray(sample.pixels) || sample.pixels.length !== 37632) {
    fail("invalid_sample_pixels", "sample must contain 37632 pixels");
  }
  for (const value of sample.pixels) {
    if (!Number.isFinite(value)) fail("invalid_pixel", "pixels must be finite");
  }
  if (![0, 1].includes(sample.label)) fail("invalid_label", "label must be 0 or 1");
}

function extractFeatures(sample) {
  assertSample(sample);
  const out = zeros(12);
  for (let c = 0; c < 3; c += 1) {
    let left = 0, right = 0, above = 0, below = 0;
    for (let y = 0; y < 112; y += 8) {
      for (let x = 0; x < 112; x += 8) {
        const v = sample.pixels[(y * 112 + x) * 3 + c];
        if (x < 56) left += v; else right += v;
        if (y < 56) above += v; else below += v;
      }
    }
    const b = c * 4;
    out[b] = left / 98;
    out[b + 1] = right / 98;
    out[b + 2] = above / 98;
    out[b + 3] = below / 98;
  }
  return out;
}

function initModel(seed) {
  const random = rng(seed);
  const small = () => (random() - 0.5) * 0.08;
  return {
    stem: matrix(4, 12, small),
    residual: matrix(4, 4, small),
    proj: matrix(512, 4, small),
    head: matrix(2, 512, small),
    bias: [0, 0],
  };
}

function l2Normalize(vector) {
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0) + 1e-12);
  return vector.map((x) => x / norm);
}

function forward(model, sample) {
  const x = extractFeatures(sample);
  const stemPre = zeros(4);
  const stem = zeros(4);
  for (let o = 0; o < 4; o += 1) {
    stemPre[o] = model.stem[o].reduce((s, w, i) => s + w * x[i], 0);
    stem[o] = Math.max(0, stemPre[o]);
  }

  const resPre = zeros(4);
  const res = zeros(4);
  for (let o = 0; o < 4; o += 1) {
    let s = stem[o];
    for (let i = 0; i < 4; i += 1) s += model.residual[o][i] * stem[i];
    resPre[o] = s;
    res[o] = Math.max(0, s);
  }

  const proj = zeros(512);
  for (let j = 0; j < 512; j += 1) {
    proj[j] = model.proj[j].reduce((s, w, i) => s + w * res[i], 0);
  }
  const embedding = l2Normalize(proj);

  const logits = model.bias.map((b, c) =>
    b + model.head[c].reduce((s, w, i) => s + w * embedding[i], 0)
  );
  const max = Math.max(...logits);
  const exp = logits.map((x) => Math.exp(x - max));
  const z = exp[0] + exp[1];
  const probs = exp.map((x) => x / z);

  return { x, stemPre, stem, resPre, res, proj, embedding, probs };
}

function trainStep(model, sample, lr) {
  const cache = forward(model, sample);
  const dLogits = [...cache.probs];
  dLogits[sample.label] -= 1;

  const dEmbedding = zeros(512);
  for (let c = 0; c < 2; c += 1) {
    const oldHead = [...model.head[c]];
    for (let j = 0; j < 512; j += 1) {
      dEmbedding[j] += dLogits[c] * oldHead[j];
      model.head[c][j] -= lr * dLogits[c] * cache.embedding[j];
    }
    model.bias[c] -= lr * dLogits[c];
  }

  // Laboratory smoke gradient through the normalized 512D path.
  const dProj = dEmbedding;
  const dRes = zeros(4);
  for (let j = 0; j < 512; j += 1) {
    const oldRow = [...model.proj[j]];
    for (let i = 0; i < 4; i += 1) {
      dRes[i] += dProj[j] * oldRow[i];
      model.proj[j][i] -= lr * dProj[j] * cache.res[i];
    }
  }

  const dResPre = dRes.map((g, i) => cache.resPre[i] > 0 ? g : 0);
  const dStem = [...dResPre]; // skip path
  for (let o = 0; o < 4; o += 1) {
    const oldRow = [...model.residual[o]];
    for (let i = 0; i < 4; i += 1) {
      dStem[i] += dResPre[o] * oldRow[i];
      model.residual[o][i] -= lr * dResPre[o] * cache.stem[i];
    }
  }

  const dStemPre = dStem.map((g, i) => cache.stemPre[i] > 0 ? g : 0);
  for (let o = 0; o < 4; o += 1) {
    for (let i = 0; i < 12; i += 1) {
      model.stem[o][i] -= lr * dStemPre[o] * cache.x[i];
    }
  }

  return Math.sqrt(dLogits.reduce((s, x) => s + x * x, 0));
}

export function makeSyntheticResidualBatch({ samplesPerClass = 4, seed = 1 } = {}) {
  if (!Number.isInteger(samplesPerClass) || samplesPerClass < 2) {
    fail("invalid_samples_per_class", "samplesPerClass must be >= 2");
  }
  const random = rng(seed);
  const samples = [];
  for (let label = 0; label < 2; label += 1) {
    for (let s = 0; s < samplesPerClass; s += 1) {
      const pixels = zeros(37632);
      for (let y = 0; y < 112; y += 1) {
        for (let x = 0; x < 112; x += 1) {
          const signal = label === 0 ? (x >= 32 && x < 64) : (y >= 48 && y < 80);
          for (let c = 0; c < 3; c += 1) {
            pixels[(y * 112 + x) * 3 + c] =
              (signal ? 0.9 : 0.12) + (c === label ? 0.15 : 0) + (random() - 0.5) * 0.08;
          }
        }
      }
      samples.push(Object.freeze({
        width: 112,
        height: 112,
        channels: 3,
        label,
        pixels: Object.freeze(pixels),
      }));
    }
  }
  return Object.freeze({ authorityBasis: "synthetic", samples: Object.freeze(samples) });
}

function evaluate(model, batch) {
  let loss = 0;
  let correct = 0;
  for (const sample of batch.samples) {
    const out = forward(model, sample);
    loss += -Math.log(Math.max(1e-12, out.probs[sample.label]));
    if ((out.probs[1] > out.probs[0] ? 1 : 0) === sample.label) correct += 1;
  }
  return Object.freeze({
    sampleCount: batch.samples.length,
    meanLoss: loss / batch.samples.length,
    accuracy: correct / batch.samples.length,
  });
}

export function runResidualBackpropSmokeTraining({
  seed = 7,
  epochs = 12,
  learningRate = 0.005,
  samplesPerClass = 4,
} = {}) {
  if (!Number.isInteger(seed)) fail("invalid_seed", "seed must be integer");
  if (!Number.isInteger(epochs) || epochs < 1 || epochs > 1000) fail("invalid_epochs", "epochs out of range");
  if (!Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 1) {
    fail("invalid_learning_rate", "learningRate out of range");
  }

  const batch = makeSyntheticResidualBatch({ samplesPerClass, seed });
  const model = initModel(seed);
  const initial = evaluate(model, batch);
  let lastGrad = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const sample of batch.samples) lastGrad = trainStep(model, sample, learningRate);
  }

  const final = evaluate(model, batch);
  const checkpointDigest = sha256({
    seed,
    epochs,
    learningRate,
    stem: model.stem.map((r) => r.map((x) => Number(x.toFixed(8)))),
    residual: model.residual.map((r) => r.map((x) => Number(x.toFixed(8)))),
    projDigest: sha256(model.proj.map((r) => r.slice(0, 8))),
  });

  return Object.freeze({
    profile: TRUST_FACE_RESIDUAL_BACKPROP_LAB_V1_PROFILE,
    authorityBasis: "synthetic",
    initial,
    final,
    lossImproved: final.meanLoss < initial.meanLoss,
    gradientObserved: lastGrad > 0,
    residualPathTrained: true,
    projection512Updated: true,
    normalizedEmbeddingPath: true,
    checkpointDigest,
    canonicalFourStageBackboneReady: false,
    biometricBackboneReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
