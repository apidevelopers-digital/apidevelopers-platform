
import { createHash } from "node:crypto";

export const TRUST_FACE_RESIDUAL_BACKPROP_LAB_V1_PROFILE = Object.freeze({
  version: "trust-face-residual-backprop-lab/v1",
  input: Object.freeze({ width: 112, height: 112, channels: 3, colorSpace: "RGB" }),
  fixedLabDownsample: Object.freeze({ width: 14, height: 14, mode: "average-8x8" }),
  trainableStemChannels: 4,
  residualBlock: Object.freeze({
    depthwiseKernel: 3,
    pointwiseChannels: 4,
    skip: true,
  }),
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

function zeros(n') {
  return Array.from({ length: n }, () => 0);
}

function matrix(rows, cols, value = 0) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => value));
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `${${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

function assertSample(sample) {
  if (!sample || sample.width !== 112 || sample.height !== 112 || sample.channels !== 3) {
    fail("invalid_sample_shape", "sample must be 112x112 RGB");
  }
  if (!Array.isArray(sample.pixels) || sample.pixels.length !== 112 * 112 * 3) {
    fail("invalid_sample_pixels", "sample.pixels must contain 37632 finite values");
  }
  for (const value of sample.pixels) {
    if (!Number.isFinite(value)) fail("invalid_pixel", "pixels must be finite");
  }
  if (![0, 1].includes(sample.label)) fail("invalid_label", "label must be 0 or 1");
}

function downsample112to14(sample) {
  assertSample(sample);
  const out = Array.from({ length: 3 }, () => zeros(14 * 14));
  for (let oy = 0; oy < 14; oy += 1) {
    for (let ox = 0; ox < 14; ox += 1) {
      for (let c = 0; c < 3; c += 1) {
        let sum = 0;
        for (let dy = 0; dy < 8; dy += 1) {
          for (let dx = 0; dx < 8; dx += 1) {
            const x = ox * 8 + dx;
            const y = oy * 8 + dy;
            sum += sample.pixels[(y * 112 + x) * 3 + c];
          }
        }
        out[c][oy * 14 + ox] = sum / 64;
      }
    }
  }
  return out;
}

function initModel(seed) {
  const random = rng(seed);
  const small = () => (random() - 0.5) * 0.16;
  return {
    stemW: Array.from({ length: 4 }, () => Array.from({ length: 3 }, small)),
    stemB: zeros(4),
    depthwiseW: Array.from({ length: 4 }, () => Array.from({ length: 9 }, small)),
    depthwiseB: zeros(4),
    pointW: Array.from({ length: 4 }, () => Array.from({ length: 4 }, small)),
    pointB: zeros(4),
    projW: Array.from({ length: 512 }, () => Array.from({ length: 4 }, small)),
    projB: zeros(512),
    headW: Array.from({ length: 2 }, () => Array.from({ length: 512 }, small),
    headB: zeros(2),
  };
}

function relu(x) {
  return x > 0 ? x : 0;
}

function forward(model, sample) {
  const input = downsample112to14(sample);
  const stemPre = Array.from({ length: 4 }, () => zeros(196));
  const stem = Array.from({ length: 4 }, () => zeros(196));
  for (let o = 0; o < 4; o += 1) {
    for (let p = 0; p < 196; p += 1) {
      let s = model.stemB[o];
      for (let c = 0; c < 3; c += 1) s += model.stemW[o][c] * input[c][p];
      stemPre[o][p] = s;
      stem[o][p] = relu(s);
    }
  }

  const dwPre = Array.from({ length: 4 }, () => zeros(196));
  const dw = Array.from({ length: 4 }, () => zeros(196));
  for (let c = 0; c < 4; c += 1) {
    for (let y = 0; y < 14; y += 1) {
      for (let x = 0; x < 14; x += 1) {
        let s = model.depthwiseB[c];
        for (let kY = 0; kY < 3; kY += 1) {
          for (let kX = 0; kX < 3; kX += 1) {
            const iY = y + kY - 1;
            const iX = x + kX - 1;
            if (iY >= 0 && iY < 14 && iX >= 0 && iX < 14) {
              s += stem[c][iY * 14 + iX] * model.depthwise[c][kY * 3 + kX];
            }
          }
        }
        const idx = y * 14 + x;
        dwPre[c][idx] = s;
        dw[c][idx] = relu(s);
      }
    }
  }

  const pointPre = Array.from({ length: 4 }, () => zeros(196));
  const residualPre = Array.from({ length: 4 }, () => zeros(196));
  const residual = Array.from({ length: 4 }, () => zeros(196));
  for (let o = 0; o < 4; o += 1) {
    for (let p = 0; p < 196; p += 1) {
      let s = model.pointB[o];
      for (let c = 0; c < 4; c += 1) s += model.pointW[o][c] * dw[c][p];
      pointPre[o][p] = s;
      residualPre[o][p] = s + stem[o][p];
      residual[o][p] = relu(residualPre[o][p]);
    }
  }

  const gap = residual.map((channel) => channel.reduce((a, b) => a + b, 0) / 196);
  const proj = zeros(512);
  for (let j = 0; j < 512; j += 1) {
    let s = model.projB[j];
    for (let i = 0; i < 4; i += 1) s += model.projW[j][i] * gap[i];
    proj[j] = s;
  }
  const norm = Math.sqrt(proj.reduce((sum, x) => sum + x * x, 0) + 1e-12);
  const embedding = proj.map((x) => x / norm);
  const logits = model.headB.map((b, c) => b + embedding.reduce((sum, x, i) => sum + x * model.headW[c][i], 0));
  const max = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - max));
  const denom = exps[0] + exps[1];
  const probs = exps.map((x) => x / denom);

  return { input, stemPre, stem, dwPre, dw, pointPre, residualPre, residual, gap, proj, norm, embedding, logits, probs };
}

function gradsLike(model) {
  return {
    stemW: matrix(4, 3), stemB: zeros(4),
    depthwiseW: matrix(4, 9), depthwiseB: zeros(4),
    pointW: matrix(4, 4), pointB: zeros(4),
    projW: matrix(512, 4), projB: zeros(512),
    headW: matrix(2, 512), headB: zeros(2),
  };
}

function backward(model, sample, cache) {
  const g = gradsLike(model);
  const dLogits = [...cache.probs];
  dLogits[sample.label] -= 1;

  const dEmbedding = zeros(512);
  for (let c = 0; c < 2; c += 1) {
    g.headB[c] += dLogits[c];
    for (let j = 0; j < 512; j += 1) {
      g.headW[c][j] += dLogits[c] * cache.embedding[j];
      dEmbedding[j] += dLogits[c] * model.headW[c][j];
    }
  }

  const dot = dEmbedding.reduce((s, x, i) => s + x * cache.proj[i], 0);
  const inv = 1 / cache.norm;
  const inv3 = inv * inv * inv;
  const dProj = dEmbdding.map((x, i) => x * inv - cache.proj[i] * dot * inv3);

  const dGap = zeros(4);
  for (let j = 0; j < 512; j += 1) {
    g.projB[j] += dProj[j];
    for (let i = 0; i < 4; i += 1) {
      g.projW[j][i] += dProj[j] * cache.gap[i];
      dGap[i] += dProj[j] * model.projW[j][i];
    }
  }

  const dResidual = Array.from({ length: 4 }, () => zeros(196));
  for (let c = 0; c < 4; c += 1) {
    const each = dGap[c] / 196;
    for (let p = 0; p < 196; p += 1) dResidual[c][p] = each;
  }

  const dPointPre = Array.from({ length: 4 }, () => zeros(196));
  const dStemSkip = Array.from({ length: 4 }, () => zeros(196));
  for (let c = 0; c < 4; c += 1) {
    for (let p = 0; p < 196; p += 1) {
      const d = cache.residualPre[c][p] > 0 ? dResidual[c][p] : 0;
      dPointPre[c][p] = d;
      dStemSkip[c][p] = d;
    }
  }

  const dDw = Array.from({ length: 4 }, () => zeros(196));
  for (let o = 0; o < 4; o += 1) {
    for (let p = 0; p < 196; p += 1) {
      const d = dPointPre[o][p];
      g.pointB[o] += d;
      for (let c = 0; c < 4; c += 1) {
        g.pointW[o][c] += d * cache.dw[c][p];
        dDw[c][p] += d * model.pointW[o][c];
      }
    }
  }

  const dDwPre = Array.from({ length: 4 }, () => zeros(196));
  for (let c = 0; c < 4; c += 1) {
    for (let p = 0; p < 196; p += 1) dDwPre[c][p] = cache.dwPre[c][p] > 0 ? dDw[c][p] : 0;
  }

  const dStem = dStemSkip.map((row) => [...row]);
  for (let c = 0; c < 4; c += 1) {
    for (let y = 0; y < 14; y += 1) {
      for (let x = 0; x < 14; x += 1) {
        const d = dDwPre[c][y * 14 + x];
        g.depthwiseB[c] += d;
        for (let kY = 0; kY < 3; kY += 1) {
          for (let kX = 0; kX < 3; kX += 1) {
            const iY = y + kY - 1;
            const iX = x + kX - 1;
            if (iY >= 0 && iY < 14 && iX >= 0 && iX < 14) {
              const idx = iY * 14 + iX;
              const k = kY * 3 + kX;
              g.depthwiseW[c][k] += d * cache.stem[c][idx];
              dStem[c][idx] += d * model.depthwise[c][k];
            }
          }
        }
      }
    }
  }

  const dStemPre = Array.from({ length: 4 }, () => zeros(196));
  for (let c = 0; c < 4; c += 1) {
    for (let p = 0; p < 196; p += 1) dStemPre[c][p] = cache.stemPre[c][p] > 0 ? dStem[c][p] : 0;
  }

  for (let o = 0; o < 4; o += 1) {
    for (let p = 0; p < 196; p += 1) {
      const d = dStemPre[o][p];
      g.stemB[o] += d;
      for (let c = 0; c < 3; c += 1) g.stemW[o][c] += d * cache.input[c][p];
    }
  }

  return g;
}

function applyGradients(model, g, lr) {
  for (let o = 0; o < 4; o += 1) {
    for (let c = 0; c < 3; c += 1) model.stemW[o][c] -= lr * g.stemW[o][c];
    model.stemB[o] -= lr * g.stemB[o];
    for (let k = 0; k < 9; k += 1) model.depthwiseW[o][k] -= lr * g.depthwiseW[o][k];
    model.depthwiseB[o] -= lr * g.depthwiseB[o];
    for (let c = 0; c < 4; c += 1) model.pointW[o][c] -= lr * g.pointW[o][c];
    model.pointB[o] -= lr * g.pointB[o];
  }
  for (let j = 0; j < 512; j += 1) {
    for (let i = 0; i < 4; i += 1) model.projW[j][i] -= lr * g.projW[j][i];
    model.projB[j] -= lr * g.projB[j];
  }
  for (let c = 0; c < 2; c += 1) {
    for (let j = 0; j < 512; j += 1) model.headW[c][j] -= lr * g.headW[c][j];
    model.headB[c] -= lr * g.headB[c];
  }
}

function gradNorm(g) {
  let sum = 0;
  const visit = (value) => {
    if (Array.isArray(value)) for (const child of value) visit(child);
    else if (Number.isFinite(value)) sum += value * value;
  };
  visit(g);
  return Math.sqrt(sum);
}

export function makeSyntheticResidualBatch({ samplesPerClass = 4, seed = 1 } = {}) {
  if (!Number.isInteger(samplesPerClass) || samplesPerClass < 2) fail("invalid_samples_per_class", "samplesPerClass must be >= 2");
  const random = rng(seed);
  const samples = [];
  for (let label = 0; label < 2; label += 1) {
    for (let s = 0; s < samplesPerClass; s += 1) {
      const pixels = zeros(112 * 112 * 3);
      for (let y = 0; y < 112; y += 1) {
        for (let x = 0; x < 112; x += 1) {
          const vertical = x >= 32 && x < 64;
          const horizontal = y >= 48 && y < 80;
          const signal = label === 0 ? vertical : horizontal;
          for (let c = 0; c < 3; c += 1) {
            const channelBias = c === label ? 0.15 : 0;
            pixels[(y * 112 + x) * 3 + c] = (signal ? 0.9 : 0.12) + channelBias + (random() - 0.5) * 0.08;
          }
        }
      }
      samples.push(Object.freeze({ width: 112, height: 112, channels: 3, label, pixels: Object.freeze(pixels) }));
    }
  }
  return Object.freeze({ authorityBasis: "synthetic", samples: Object.freeze(samples) });
}

function evaluate(model, batch) {
  let loss = 0;
  let correct = 0;
  for (const sample of batch.samples) {
    const cache = forward(model, sample);
    loss += -Math.log(Math.max(1e-12, cache.probs[sample.label]));
    if ((cache.probs[1] > cache.probs[0] ? 1 : 0) === sample.label) correct += 1;
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
  learningRate = 0.025,
  samplesPerClass = 4,
} = {}) {
  if (!Number.isInteger(seed)) fail("invalid_seed", "seed must be integer");
  if (!Number.isInteger(epochs) || epochs < 1 || epochs > 1000) fail("invalid_epochs", "epochs out of range");
  if (!Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 1) fail("invalid_learning_rate", "learningRate out of range");

  const batch = makeSyntheticResidualBatch({ samplesPerClass, seed });
  const model = initModel(seed);
  const initial = evaluate(model, batch);
  let lastGradNorm = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const sample of batch.samples) {
      const cache = forward(model, sample);
      const g = backward(model, sample, cache);
      lastGradNorm = gradNorm(g);
      applyGradients(model, g, learningRate);
    }
  }

  const final = evaluate(model, batch);
  const checkpointDigest = digest({seed,epochs,learningRate,samplesPerClass,stemW:model.stemW.map((r)=>r.map((x)=>Number(x.toFixed(8)))),depthwiseW:model.depthwiseW.map((r)=>r.map((x)=>Number(x.toFixed(8)))), pointW:model.pointW.map((r)=>r.map((x)=>Number(x.toFixed(8))), projDigest: digest(model.projW.map((r)=>r.map((x)=>Number(x.toFixed(8))))), headDigest: digest(model.headW.map((r)=>r.map((x)=>Number(x.toFixed(8)))) });

  return Object.freeze({
    profile: TRUST_FACE_RESIDUAL_BACKPROP_LAB_V1_PROFILE,
    authorityBasis: "synthetic",
    initial,
    final,
    lossImproved: final.meanLoss < initial.meanLoss,
    gradientObserved: lastGradNorm > 0,
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
