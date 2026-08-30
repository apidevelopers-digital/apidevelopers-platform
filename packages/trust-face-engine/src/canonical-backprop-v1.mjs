import { createHash } from "node:crypto";
import { createCanonicalBackboneTrainingGraph } from "./canonical-backbone-graph-v1.mjs";

export const TRUST_FACE_CANONICAL_BACKPROP_V1 = Object.freeze({
  version: "trust-face-canonical-backprop/v1",
  authorityBasis: "synthetic",
  canonicalGraphBackpropReady: true,
  spatialConvolutionBackpropReady: false,
  biometricBackboneReady: false,
  productionReady: false,
  biometricClaimReady: false,
  realBiometricTrainingAuthorized: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceCanonicalBackpropV1Error";
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
function zeros(n) { return Array.from({ length: n }, () => 0); }
function matrix(rows, cols, fn) {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => fn(r, c)));
}
function l2(v) { return Math.sqrt(v.reduce((s, x) => s + x * x, 0) + 1e-12); }
function normalize(v) {
  const n = l2(v);
  return { vector: v.map((x) => x / n), norm: n };
}
function dot(a,b){ let s=0; for(let i=0;i<a.length;i++) s += a[i]*b[i]; return s; }
function relu(x){ return x > 0 ? x : 0; }
function sha256(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function matVec(w, x) {
  const out = zeros(w.length);
  for (let o = 0; o < w.length; o += 1) {
    let s = 0;
    const row = w[o];
    for (let i = 0; i < row.length; i += 1) s += row[i] * x[i];
    out[o] = s;
  }
  return out;
}

function initModel(seed = 7, classCount = 4) {
  const graph = createCanonicalBackboneTrainingGraph();
  const random = rng(seed);
  const small = (fanIn) => (random() - 0.5) * (2 / Math.sqrt(fanIn));
  const stemInputDim = 12;
  const stemDim = graph.stageWidths[0];
  const stem = matrix(stemDim, stemInputDim, () => small(stemInputDim));

  const blocks = [];
  let currentDim = stemDim;
  for (const block of graph.blocks) {
    const outDim = block.width;
    blocks.push({
      stageIndex: block.stageIndex,
      blockIndex: block.blockIndex,
      inDim: currentDim,
      outDim,
      main: matrix(outDim, currentDim, () => small(currentDim)),
      skip: currentDim === outDim ? null : matrix(outDim, currentDim, () => small(currentDim)),
      bias: zeros(outDim),
    });
    currentDim = outDim;
  }
  const projection = matrix(graph.embeddingDim, currentDim, () => small(currentDim));
  const classWeights = Array.from({ length: classCount }, () => {
    const raw = Array.from({ length: graph.embeddingDim }, () => small(graph.embeddingDim));
    return normalize(raw).vector;
  });
  return { graph, stem, blocks, projection, classWeights };
}

function extractSyntheticStemFeatures(sample) {
  if (!sample || sample.width !== 112 || sample.height !== 112 || sample.channels !== 3) {
    fail("invalid_sample_shape", "sample must be 112x112 RGB");
  }
  if (!Array.isArray(sample.pixels) || sample.pixels.length !== 112 * 112 * 3) {
    fail("invalid_sample_pixels", "sample must contain 37632 pixels");
  }
  const out = zeros(12);
  for (let c = 0; c < 3; c += 1) {
    let left = 0, right = 0, top = 0, bottom = 0;
    let nLeft = 0, nRight = 0, nTop = 0, nBottom = 0;
    for (let y = 0; y < 112; y += 8) {
      for (let x = 0; x < 112; x += 8) {
        const v = sample.pixels[(y * 112 + x) * 3 + c];
        if (x < 56) { left += v; nLeft += 1; } else { right += v; nRight += 1; }
        if (y < 56) { top += v; nTop += 1; } else { bottom += v; nBottom += 1; }
      }
    }
    const b = c * 4;
    out[b] = left / nLeft;
    out[b + 1] = right / nRight;
    out[b + 2] = top / nTop;
    out[b + 3] = bottom / nBottom;
  }
  return out;
}

function forward(model, sample, { scale, marginRadians }) {
  const input = extractSyntheticStemFeatures(sample);
  const stemPre = matVec(model.stem, input);
  const stem = stemPre.map(relu);
  const blockCaches = [];
  let x = stem;
  for (const block of model.blocks) {
    const main = matVec(block.main, x);
    const skip = block.skip ? matVec(block.skip, x) : [...x];
    const pre = zeros(block.outDim);
    const y = zeros(block.outDim);
    for (let o = 0; o < block.outDim; o += 1) {
      pre[o] = main[o] + skip[o] + block.bias[c];
      y[o] = relu(pre[o]);
    }
    blockCaches.push({ input: x, pre, output: y });
    x = y;
  }
  const proj = matVec(model.projection, x);
  const normalized = normalize(proj);
  const embedding = normalized.vector;
  const cosines = model.classWeights.map((w) => Math.max(-0.999999, Math.min(0.999999, dot(embedding, w))));
  const logits = cosines.map((c) => scale * c);
  const target = sample.label;
  const c = cosines[target];
  logits[target] = scale * Math.cos(Math.acos(c) + marginRadians);

  const max = Math.max(...logits);
  const exps = logits.map((z) => Math.exp(z - max));
  const sum = exps.reduce((a,b) => a+b,0);
  const probs = exps.map((z) => z / sum);
  const loss = -Math.log(Math.max(1e-12, probs[target]));

  return { input, stemPre, stem, blockCaches, finalBlock: x, proj, projNorm: normalized.norm, embedding, cosines, logits, probs, loss };
}

function trainStep(model, sample, { learningRate, scale, marginRadians }) {
  const cache = forward(model, sample, { scale, marginRadians });
  const dLogits = [...cache.probs];
  dLogits[sample.label] -= 1;

  const dEmbedding = zeros(model.graph.embeddingDim);
  for (let c = 0; c < model.classWeights.length; c += 1) {
    let dCos = dLogits[c] * scale;
    if (c === sample.label) {
      const cosine = cache.cosines[c];
      const denom = Math.sqrt(Math.max(1e-12, 1 - cosine * cosine));
      dCos *= Math.cos(marginRadians) + (cosine / denom) * Math.sin(marginRadians);
    }
    const w = model.classWeights[c];
    for (let j = 0; j < dEmbedding.length; j += 1) dEmbedding[j] += dCos * w[j];
  }

  const embDotGrad = dot(cache.embedding, dEmbedding);
  const dProj = dEmbedding.map((g, j) => (g - cache.embedding[j] * embDotGrad) / cache.projNorm);

  let dX = zeros(cache.finalBlock.length);
  for (let j = 0; j < model.projection.length; j += 1) {
    const oldRow = [...model.projection[j]];
    for (let i = 0; i < oldRow.length; i += 1) {
      dX[i] += dProj[j] * oldRow[i];
      model.projection[j][i] -= learningRate * dProj[j] * cache.finalBlock[i];
    }
  }

  const blockGradientNorms = zeros(model.blocks.length);
  for (let bi = model.blocks.length - 1; bi >= 0; bi -= 1) {
    const block = model.blocks[bi];
    const bc = cache.blockCaches[bi];
    const dPre = dX.map((g, o) => bc.pre[o] > 0 ? g : 0);
    const dInput = zeros(block.inDim);
    let normSq = 0;

    for (let o = 0; o < block.outDim; o += 1) {
      const oldMain = [...block.main[o]];
      for (let i = 0; i < block.inDim; i += 1) {
        const grad = dPre[o] * bc.input[i];
        normSq += grad * grad;
        dInput[i] += dPre[o] * oldMain[i];
        block.main[o][i] -= learningRate * grad;
      }
      block.bias[o] -= learningRate * dPre[o];
    }

    if (block.skip) {
      for (let o = 0; o < block.outDim; o += 1) {
        const oldSkip = [...block.skip[o]];
        for (let i = 0; i < block.inDim; i += 1) {
          const grad = dPre[o] * bc.input[i];
          normSq += grad * grad;
          dInput[i] += dPre[o] * oldSkip[i];
          block.skip[o][i] -= learningRate * grad;
        }
      }
    } else {
      for (let i = 0; i < dInput.length; i += 1) dInput[i] += dPre[i];
    }
    blockGradientNorms[bi] = Math.sqrt(normSq);
    dX = dInput;
  }

  const dStemPre = dX.map((g, i) => cache.stemPre[i] > 0 ? g : 0);
  for (let o = 0; o < model.stem.length; o += 1) {
    for (let i = 0; i < model.stem[o].length; i += 1) {
      model.stem[o][i] -= learningRate * dStemPre[o] * cache.input[i];
    }
  }

  return { loss: cache.loss, blockGradientNorms, embeddingNorm: l2(cache.embedding) };
}

export function makeCanonicalSyntheticBatch({ classCount = 4, samplesPerClass = 2, seed = 11 } = {}) {
  if (!Number.isInteger(classCount) || classCount < 2 || classCount > 8) fail("invalid_class_count", "classCount must be 2..8");
  if (!Number.isInteger(samplesPerClass) || samplesPerClass < 1 || samplesPerClass > 8) fail("invalid_samples_per_class", "samplesPerClass must be 1..8");
  const random = rng(seed);
  const samples = [];
  for (let label = 0; label < classCount; label += 1) {
    for (let s = 0; s < samplesPerClass#² { ++ s){
      const pixels = zeros(112 * 112 * 3);
      for (let y = 0; y < 112; y += 1) {
        for (let x = 0; x < 112; x += 1) {
          const stripe = label % 2 === 0
            ? (x >= 20 + label * 6 && x < 52 + label * 6)
            : (y >= 20 + label * 6 && y < 52 + label * 6);
          for (let c = 0; c < 3; c += 1) {
            pixels[(y * 112 + x) * 3 + c] =
              (stripe ? 0.82 : 0.14) + (c === label % 3 ? 0.1 : 0) + (random() - 0.5) * 0.04;
          }
        }
      }
      samples.push(Object.freeze({ width:112, height:112, channels:3, label, pixels:Object.freeze(pixels) }));
    }
  }
  return Object.freeze({ authorityBasis:"synthetic", classCount, samples:Object.freeze(samples) });
}

function evaluate(model, batch, cfg) {
  let loss = 0;
  let correct = 0;
  for (const sample of batch.samples) {
    const out = forward(model, sample, cfg);
    loss += out.loss;
    let best = 0;
    for (let i = 1; i < out.logits.length; i += 1) if (out.logits[i] > out.logits[best]) best = i;
    if (best === sample.label) correct += 1;
  }
  return Object.freeze({ meanLoss: loss / batch.samples.length, accuracy: correct / batch.samples.length });
}

export function runCanonicalBackpropSyntheticTraining({
  seed = 7,
  classCount = 4,
  samplesPerClass = 2,
  epochs = 3,
  learningRate = 0.0005,
  scale = 16,
  marginRadians = 0.2,
} = {}) {
  if (!Number.isInteger(epochs) || epochs < 1 || epochs > 20) fail("invalid_epochs", "epochs must be 1..20");
  if (!Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 0.1) fail("invalid_learning_rate", "learningRate out of range");
  const batch = makeCanonicalSyntheticBatch({ classCount, samplesPerClass, seed: seed + 101 });
  const model = initModel(seed, classCount);
  const cfg = { scale, marginRadians };
  const initial = evaluate(model, batch, cfg);
  const before = model.blocks.map((b) => sha256({ main: b.main, skip: b.skip, bias: b.bias }));
  const observed = zeros(model.blocks.length);
  let lastEmbeddingNorm = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const sample of batch.samples) {
      const step = trainStep(model, sample, { ...cfg, learningRate });
      lastEmbeddingNorm = step.embeddingNorm;
      for (let i = 0; i < observed.length; i += 1) observed[i] = Math.max(observed[i], step.blockGradientNorms[i]);
    }
  }

  const final = evaluate(model, batch, cfg);
  const after = model.blocks.map((b) => sha256({ main: b.main, skip: b.skip, bias: b.bias }));
  const updatedBlocks = after.map((digest, i) => digest !== before[i]);
  const gradientReachedAllBlocks = observed.every((v) => Number.isFinite(v) && v > 0);
  const allBlocksUpdated = updatedBlocks.every(Boolean);

  return Object.freeze({
    profile: TRUST_FACE_CANONICAL_BACKPROP_V1,
    authorityBasis: "synthetic",
    architectureVersion: model.graph.architectureVersion,
    blockCount: model.blocks.length,
    stageWidths: model.graph.stageWidths,
    stageDepths: model.graph.stageDepths,
    embeddingDim: model.graph.embeddingDim,
    initial,
    final,
    lossImproved: final.meanLoss < initial.meanLoss,
    gradientReachedAllBlocks,
    allBlocksUpdated,
    blockGradientNorms: Object.freeze(observed),
    embeddingNormApproximatelyOne: Math.abs(lastEmbeddingNorm - 1) < 1e-9,
    checkpointDigest: sha256({ stem:model.stem, blocks:model.blocks, projection:model.projection }),
    canonicalGraphBackpropReady: gradientReachedAllBlocks && allBlocksUpdated,
    spatialConvolutionBackpropReady: false,
    biometricBackboneReady: false,
    productionReady: false,
    biometricClaimReady: false,
    realBiometricTrainingAuthorized: false,
  });
}
