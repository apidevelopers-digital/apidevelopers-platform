import { createHash } from "node:crypto";

export const TRUST_FACE_SPATIAL_STEM_BACKPROP_V1 = Object.freeze({
  version: "trust-face-spatial-stem-backprop/v1",
  authorityBasis: "synthetic",
  inputShape: Object.freeze({ width: 112, height: 112, channels: 3 }),
  kernelShape: Object.freeze({ width: 3, height: 3, depthwiseChannels: 3 }),
  outputFeatureDim: 12,
  spatialStemBackpropReady: true,
  canonicalAngularMarginIntegrationReady: false,
  biometricBackboneReady: false,
  productionReady: false,
  biometricClaimReady: false,
  realBiometricTrainingAuthorized: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceSpatialStemBackpropV1Error";
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

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function assertSample(sample) {
  if (!sample || sample.width !== 112 || sample.height !== 112 || sample.channels !== 3) {
    fail("invalid_sample_shape", "sample must be 112x112 RGB");
  }
  if (!Array.isArray(sample.pixels) || sample.pixels.length !== 112 * 112 * 3) {
    fail("invalid_sample_pixels", "sample must contain 37632 pixels");
  }
}

function initModel(seed, classCount) {
  const random = rng(seed);
  const small = () => (random() - 0.5) * 0.08;
  return {
    kernels: Array.from({ length: 3 }, () => Array.from({ length: 9 }, small)),
    biases: zeros(3),
    head: Array.from({ length: classCount }, () => Array.from({ length: 12 }, small)),
    headBias: zeros(classCount),
  };
}

function convDepthwise(sample, model) {
  assertSample(sample);
  const stride = 8;
  const outW = 14;
  const outH = 14;
  const pre = Array.from({ length: 3 }, () => zeros(outW * outH));
  const act = Array.from({ length: 3 }, () => zeros(outW * outH));

  for (let c = 0; c < 3; c += 1) {
    for (let oy = 0; oy < outH; oy += 1) {
      for (let ox = 0; ox < outW; ox += 1) {
        let sum = model.biases[c];
        const baseY = Math.min(109, oy * stride);
        const baseX = Math.min(109, ox * stride);
        for (let ky = 0; ky < 3; ky += 1) {
          for (let kx = 0; kx < 3; kx += 1) {
            const pixelIndex = ((baseY + ky) * 112 + (baseX + kx)) * 3 + c;
            sum += sample.pixels[pixelIndex] * model.kernels[c][ky * 3 + kx];
          }
        }
        const idx = oy * outW + ox;
        pre[c][idx] = sum;
        act[c][idx] = sum > 0 ? sum : 0;
      }
    }
  }
  return { pre, act, outW, outH, stride };
}

function quadrantPool(act, outW, outH) {
  const features = zeros(12);
  for (let c = 0; c < 3; c += 1) {
    for (let qy = 0; qy < 2; qy += 1) {
      for (let qx = 0; qx < 2; qx += 1) {
        let sum = 0;
        let count = 0;
        for (let y = qy * 7; y < (qy + 1) * 7; y += 1) {
          for (let x = qx * 7; x < (qx + 1) * 7; x += 1) {
            sum += act[c][y * outW + x];
            count += 1;
          }
        }
        features[c * 4 + qy * 2 + qx] = sum / count;
      }
    }
  }
  return features;
}

function logitsFor(features, model) {
  return model.headBias.map((b, c) =>
    b + features.reduce((sum, x, i) => sum + x * model.head[c][i], 0)
  );
}

function softmax(logits) {
  const m = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - m));
  const s = exps.reduce((a, b) => a + b, 0);
  return exps.map((x) => x / s);
}

function forward(sample, model) {
  const conv = convDepthwise(sample, model);
  const features = quadrantPool(conv.act, conv.outW, conv.outH);
  const logits = logitsFor(features, model);
  const probs = softmax(logits);
  const loss = -Math.log(Math.max(1e-12, probs[sample.label]));
  return { conv, features, logits, probs, loss };
}

function trainStep(sample, model, learningRate) {
  const cache = forward(sample, model);
  const dLogits = [...cache.probs];
  dLogits[sample.label] -= 1;

  const dFeatures = zeros(12);
  for (let c = 0; c < model.head.length; c += 1) {
    const old = [...model.head[c]];
    for (let i = 0; i < 12; i += 1) {
      dFeatures[i] += dLogits[c] * old[i];
      model.head[c][i] -= learningRate * dLogits[c] * cache.features[i];
    }
    model.headBias[c] -= learningRate * dLogits[c];
  }

  const dAct = Array.from({ length: 3 }, () => zeros(14 * 14));
  for (let c = 0; c < 3; c += 1) {
    for (let qy = 0; qy < 2; qy += 1) {
      for (let qx = 0; qx < 2; qx += 1) {
        const g = dFeatures[c * 4 + qy * 2 + qx] / 49;
        for (let y = qy * 7; y < (qy + 1) * 7; y += 1) {
          for (let x = qx * 7; x < (qx + 1) * 7; x += 1) {
            dAct[c][y * 14 + x] += g;
          }
        }
      }
    }
  }

  const dKernels = Array.from({ length: 3 }, () => zeros(9));
  const dBias = zeros(3);
  const dPixels = zeros(112 * 112 * 3);

  for (let c = 0; c < 3; c += 1) {
    for (let oy = 0; oy < 14; oy += 1) {
      for (let ox = 0; ox < 14; ox += 1) {
        const idx = oy * 14 + ox;
        const dPre = cache.conv.pre[c][idx] > 0 ? dAct[c][idx] : 0;
        dBias[c] += dPre;
        const baseY = Math.min(109, oy * 8);
        const baseX = Math.min(109, ox * 8);
        for (let ky = 0; ky < 3; ky += 1) {
          for (let kx = 0; kx < 3; kx += 1) {
            const k = ky * 3 + kx;
            const pixelIndex = ((baseY + ky) * 112 + (baseX + kx)) * 3 + c;
            dKernels[c][k] += sample.pixels[pixelIndex] * dPre;
            dPixels[pixelIndex] += model.kernels[c][k] * dPre;
          }
        }
      }
    }
  }

  for (let c = 0; c < 3; c += 1) {
    for (let k = 0; k < 9; k += 1) model.kernels[c][k] -= learningRate * dKernels[c][k];
    model.biases[c] -= learningRate * dBias[c];
  }

  const kernelGradNorm = Math.sqrt(dKernels.flat().reduce((s, x) => s + x * x, 0));
  const pixelGradNorm = Math.sqrt(dPixels.reduce((s, x) => s + x * x, 0));
  return { loss: cache.loss, kernelGradNorm, pixelGradNorm, features: cache.features };
}

export function makeSpatialStemSyntheticBatch({ classCount = 3, samplesPerClass = 2, seed = 23 } = {}) {
  if (!Number.isInteger(classCount) || classCount < 2 || classCount > 6) fail("invalid_class_count", "classCount must be 2..6");
  if (!Number.isInteger(samplesPerClass) || samplesPerClass < 1 || samplesPerClass > 8) fail("invalid_samples_per_class", "samplesPerClass must be 1..8");
  const random = rng(seed);
  const samples = [];
  for (let label = 0; label < classCount; label += 1) {
    for (let s = 0; s < samplesPerClass; s += 1) {
      const pixels = zeros(112 * 112 * 3);
      for (let y = 0; y < 112; y += 1) {
        for (let x = 0; x < 112; x += 1) {
          for (let c = 0; c < 3; c += 1) {
            const band = label % 2 === 0
              ? (x >= 16 + label * 8 && x < 48 + label * 8)
              : (y >= 16 + label * 8 && y < 48 + label * 8);
            pixels[(y * 112 + x) * 3 + c] =
              (band ? 0.78 : 0.12) + (c === label % 3 ? 0.08 : 0) + (random() - 0.5) * 0.03;
          }
        }
      }
      samples.push(Object.freeze({ width: 112, height: 112, channels: 3, label, pixels: Object.freeze(pixels) }));
    }
  }
  return Object.freeze({ authorityBasis: "synthetic", classCount, samples: Object.freeze(samples) });
}

function evaluate(model, batch) {
  let loss = 0;
  let correct = 0;
  for (const sample of batch.samples) {
    const out = forward(sample, model);
    loss += out.loss;
    let best = 0;
    for (let i = 1; i < out.logits.length; i += 1) if (out.logits[i] > out.logits[best]) best = i;
    if (best === sample.label) correct += 1;
  }
  return Object.freeze({ meanLoss: loss / batch.samples.length, accuracy: correct / batch.samples.length });
}

export function runSpatialStemBackpropSyntheticTraining({
  seed = 29,
  classCount = 3,
  samplesPerClass = 2,
  epochs = 3,
  learningRate = 0.01,
} = {}) {
  if (!Number.isInteger(epochs) || epochs < 1 || epochs > 20) fail("invalid_epochs", "epochs must be 1..20");
  if (!Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 0.2) fail("invalid_learning_rate", "learningRate out of range");

  const batch = makeSpatialStemSyntheticBatch({ classCount, samplesPerClass, seed: seed + 1 });
  const model = initModel(seed, classCount);
  const initial = evaluate(model, batch);
  const before = digest({ kernels: model.kernels, biases: model.biases });
  let maxKernelGradNorm = 0;
  let maxPixelGradNorm = 0;
  let lastFeatureDim = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const sample of batch.samples) {
      const step = trainStep(sample, model, learningRate);
      maxKernelGradNorm = Math.max(maxKernelGradNorm, step.kernelGradNorm);
      maxPixelGradNorm = Math.max(maxPixelGradNorm, step.pixelGradNorm);
      lastFeatureDim = step.features.length;
    }
  }

  const final = evaluate(model, batch);
  const after = digest({ kernels: model.kernels, biases: model.biases });
  return Object.freeze({
    profile: TRUST_FACE_SPATIAL_STEM_BACKPROP_V1,
    authorityBasis: "synthetic",
    initial,
    final,
    outputFeatureDim: lastFeatureDim,
    kernelGradientObserved: Number.isFinite(maxKernelGradNorm) && maxKernelGradNorm > 0,
    pixelGradientObserved: Number.isFinite(maxPixelGradNorm) && maxPixelGradNorm > 0,
    spatialWeightsUpdated: before !== after,
    checkpointDigest: after,
    spatialStemBackpropReady: maxKernelGradNorm > 0 && maxPixelGradNorm > 0 && before !== after && lastFeatureDim === 12,
    canonicalAngularMarginIntegrationReady: false,
    biometricBackboneReady: false,
    productionReady: false,
    biometricClaimReady: false,
    realBiometricTrainingAuthorized: false,
  });
}
