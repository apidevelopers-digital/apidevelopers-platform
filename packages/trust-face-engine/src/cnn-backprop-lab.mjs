import { createHash } from "node:crypto";

export const TRUST_FACE_CNN_BACKPROP_LAB_PROFILE = Object.freeze({
  version: "trust-face-cnn-backprop-lab/v1",
  inputShape: Object.freeze({ width: 8, height: 8, channels: 1 }),
  kernelShape: Object.freeze({ width: 3, height: 3, filters: 2 }),
  classes: 2,
  productionReady: false,
  biometricClaimReady: false,
  biometricBackboneReady: false,
  realBiometricTrainingAuthorized: false,
  rawBiometricLogging: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceCnnBackpropLabError";
  error.code = code;
  throw error;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
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

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((x) => x / sum);
}

function assertImage(image) {
  if (!image || image.width !== 8 || image.height !== 8 || !Array.isArray(image.pixels) || image.pixels.length !== 64) {
    fail("invalid_image", "image must be 8x8 grayscale with 64 pixels");
  }
  for (const value of image.pixels) if (!Number.isFinite(value)) fail("invalid_pixel", "pixels must be finite");
}

function convForward(image, kernels, biases) {
  assertImage(image);
  const outW = 6, outH = 6;
  const pre = Array.from({ length: 2 }, () => zeros(outW * outH));
  const act = Array.from({ length: 2 }, () => zeros(outW * outH));
  for (let f = 0; f < 2; f += 1) {
    for (let oy = 0; oy < outH; oy += 1) {
      for (let ox = 0; ox < outW; ox += 1) {
        let sum = biases[f];
        for (let ky = 0; ky < 3; ky += 1) {
          for (let kx = 0; kx < 3; kx += 1) {
            sum += image.pixels[(oy + ky) * 8 + (ox + kx)] * kernels[f][ky * 3 + kx];
          }
        }
        const idx = oy * outW + ox;
        pre[f][idx] = sum;
        act[f][idx] = sum > 0 ? sum : 0;
      }
    }
  }
  return { pre, act, outW, outH };
}

function gapForward(act) {
  return act.map((channel) => channel.reduce((a, b) => a + b, 0) / channel.length);
}

function linearForward(features, weights, biases) {
  return biases.map((b, c) => b + features.reduce((sum, x, i) => sum + x * weights[c][i], 0));
}

function initModel(seed) {
  const random = rng(seed);
  return {
    kernels: Array.from({ length: 2 }, () => Array.from({ length: 9 }, () => (random() - 0.5) * 0.2)),
    convBias: [0, 0],
    headWeights: Array.from({ length: 2 }, () => Array.from({ length: 2 }, () => (random() - 0.5) * 0.2)),
    headBias: [0, 0],
  };
}

function trainStep(model, sample, learningRate) {
  const conv = convForward(sample.image, model.kernels, model.convBias);
  const features = gapForward(conv.act);
  const logits = linearForward(features, model.headWeights, model.headBias);
  const probs = softmax(logits);
  const loss = -Math.log(Math.max(1e-12, probs[sample.label]));
  const dLogits = [...probs];
  dLogits[sample.label] -= 1;
  const dHeadWeights = model.headWeights.map(() => zeros(features.length));
  const dFeatures = zeros(features.length);
  for (let c = 0; c < 2; c += 1) {
    for (let i = 0; i < features.length; i += 1) {
      dHeadWeights[c][i] = dLogits[c] * features[i];
      dFeatures[i] += dLogits[c] * model.headWeights[c][i];
    }
  }
  const dKernels = model.kernels.map(() => zeros(9));
  const dConvBias = zeros(2);
  const area = conv.outW * conv.outH;
  for (let f = 0; f < 2; f += 1) {
    const perCell = dFeatures[f] / area;
    for (let oy = 0; oy < conv.outH; oy += 1) {
      for (let ox = 0; ox < conv.outW; ox += 1) {
        const idx = oy * conv.outW + ox;
        const dPre = conv.pre[f][idx] > 0 ? perCell : 0;
        dConvBias[f] += dPre;
        for (let ky = 0; ky < 3; ky += 1) {
          for (let kx = 0; kx < 3; kx += 1) {
            dKernels[f][ky * 3 + kx] += sample.image.pixels[(oy + ky) * 8 + (ox + kx)] * dPre;
          }
        }
      }
    }
  }
  for (let f = 0; f < 2; f += 1) {
    for (let k = 0; k < 9; k += 1) model.kernels[f][k] -= learningRate * dKernels[f][k];
    model.convBias[f] -= learningRate * dConvBias[f];
  }
  for (let c = 0; c < 2; c += 1) {
    for (let i = 0; i < features.length; i += 1) model.headWeights[c][i] -= learningRate * dHeadWeights[c][i];
    model.headBias[c] -= learningRate * dLogits[c];
  }
  const gradNorm = Math.sqrt(dKernels.flat().reduce((s, x) => s + x * x, 0) + dHeadWeights.flat().reduce((s, x) => s + x * x, 0));
  return { loss, gradNorm };
}

export function makeSyntheticCnnBatch({ samplesPerClass = 12, seed = 1 } = {}) {
  if (!Number.isInteger(samplesPerClass) || samplesPerClass < 2) fail("invalid_samples_per_class", "samplesPerClass must be >= 2");
  const random = rng(seed);
  const samples = [];
  for (let label = 0; label < 2; label += 1) {
    for (let s = 0; s < samplesPerClass; s += 1) {
      const pixels = zeros(64);
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const stripe = label === 0 ? (x >= 2 && x <= 4) : (y >= 3 && y <= 5);
          pixels[y * 8 + x] = (stripe ? 1 : 0.1) + (random() - 0.5) * 0.15;
        }
      }
      samples.push(Object.freeze({ label, image: Object.freeze({ width: 8, height: 8, pixels: Object.freeze(pixels) }) }));
    }
  }
  return Object.freeze({ authorityBasis: "synthetic", samples: Object.freeze(samples) });
}

export function evaluateCnnBackpropLab(model, batch) {
  let loss = 0, correct = 0;
  for (const sample of batch.samples) {
    const conv = convForward(sample.image, model.kernels, model.convBias);
    const features = gapForward(conv.act);
    const probs = softmax(linearForward(features, model.headWeights, model.headBias));
    loss += -Math.log(Math.max(1e-12, probs[sample.label]));
    if ((probs[1] > probs[0] ? 1 : 0) === sample.label) correct += 1;
  }
  return Object.freeze({ sampleCount: batch.samples.length, meanLoss: loss / batch.samples.length, accuracy: correct / batch.samples.length });
}

export function runCnnBackpropSmokeTraining({ seed = 1, epochs = 40, learningRate = 0.08, samplesPerClass = 12 } = {}) {
  if (!Number.isInteger(seed)) fail("invalid_seed", "seed must be integer");
  if (!Number.isInteger(epochs) || epochs < 1 || epochs > 10000) fail("invalid_epochs", "epochs out of range");
  if (!Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 1) fail("invalid_learning_rate", "learningRate out of range");
  const batch = makeSyntheticCnnBatch({ samplesPerClass, seed });
  const model = initModel(seed);
  const initial = evaluateCnnBackpropLab(model, batch);
  let lastGradNorm = 0;
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const sample of batch.samples) lastGradNorm = trainStep(model, sample, learningRate).gradNorm;
  }
  const final = evaluateCnnBackpropLab(model, batch);
  const checkpointDigest = digest({ seed, epochs, learningRate, samplesPerClass, model });
  return Object.freeze({
    profile: TRUST_FACE_CNN_BACKPROP_LAB_PROFILE,
    authorityBasis: "synthetic",
    initial,
    final,
    lossImproved: final.meanLoss < initial.meanLoss,
    gradientObserved: lastGradNorm > 0,
    checkpointDigest,
    convolutionWeightsUpdated: true,
    realBackpropagation: true,
    biometricBackboneReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
