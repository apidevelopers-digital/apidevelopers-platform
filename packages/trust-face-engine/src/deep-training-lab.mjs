
import { createHash } from "node:crypto";
import {
  createAngularMarginLogits,
  normalizeDeepEmbedding,
} from "./deep-embedding-v1.mjs";

export const TRUST_FACE_DEEP_TRAINING_LAB_PROFILE = Object.freeze({
  version: "trust-face-deep-training-lab/v1",
  productionReady: false,
  biometricClaimReady: false,
  backboneWeightsTrained: false,
  realBiometricTrainingAuthorized: false,
  allowedAuthorityBasis: Object.freeze(["synthetic", "public-licensed", "consented-training"]),
  rawBiometricLogging: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceDeepTrainingLabError";
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

function sha256(value) {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function createDeepTrainingRunSpec({
  runId,
  datasetManifestDigest,
  authorityBasis,
  codeCommit,
  seed,
  epochs = 2,
  embeddingDim = 512,
  scale = 64,
  marginRadians = 0.5,
  qualityAware = true,
} = {}) {
  if (typeof runId !== "string" || !runId.trim()) fail("invalid_run_id", "runId is required");
  if (typeof datasetManifestDigest !== "string" || !datasetManifestDigest.startsWith("sha256:")) {
    fail("invalid_dataset_digest", "datasetManifestDigest must be sha256");
  }
  if (!TRUST_FACE_DEEP_TRAINING_LAB_PROFILE.allowedAuthorityBasis.includes(authorityBasis)) {
    fail("unsupported_authority_basis", "dataset authority is not allowed for deep training lab");
  }
  if (authorityBasis === "consented-training") {
    fail("consented_training_requires_separate_approval", "real biometric training requires separate explicit approval");
  }
  if (typeof codeCommit !== "string" || codeCommit.length < 7) fail("invalid_code_commit", "codeCommit is required");
  if (!Number.isInteger(seed)) fail("invalid_seed", "seed must be an integer");
  if (!Number.isInteger(epochs) || epochs < 1 || epochs > 10000) fail("invalid_epochs", "epochs is out of range");
  if (!Number.isInteger(embeddingDim) || embeddingDim < 128 || embeddingDim > 2048) {
    fail("invalid_embedding_dim", "embeddingDim is out of range");
  }

  const spec = Object.freeze({
    profile: TRUST_FACE_DEEP_TRAINING_LAB_PROFILE.version,
    runId: runId.trim(),
    datasetManifestDigest,
    authorityBasis,
    codeCommit,
    seed,
    epochs,
    embeddingDim,
    scale,
    marginRadians,
    qualityAware: qualityAware === true,
    productionReady: false,
    biometricClaimReady: false,
    backboneWeightsTrained: false,
  });
  return Object.freeze({ ...spec, digest: sha256(spec) });
}

export function makeSyntheticIdentityBatch({
  identities = 4,
  samplesPerIdentity = 4,
  embeddingDim = 512,
  seed = 1,
} = {}) {
  if (!Number.isInteger(identities) || identities < 2) fail("invalid_identities", "identities must be >= 2");
  if (!Number.isInteger(samplesPerIdentity) || samplesPerIdentity < 2) {
    fail("invalid_samples_per_identity", "samplesPerIdentity must be >= 2");
  }
  const random = rng(seed);
  const centers = Array.from({ length: identities }, (_, classIndex) => {
    const raw = Array.from({ length: embeddingDim }, (_, i) => {
      const base = ((classIndex + 1) * (i + 3)) % 17;
      return Math.sin(base) + (random() - 0.5) * 0.05;
    });
    return normalizeDeepEmbedding(raw, embeddingDim);
  });

  const samples = [];
  for (let c = 0; c < identities; c += 1) {
    for (let s = 0; s < samplesPerIdentity; s += 1) {
      const raw = centers[c].map((v, i) => v + (random() - 0.5) * 0.08 + Math.sin((i + 1) * (s + 1)) * 0.002);
      samples.push(Object.freeze({
        classIndex: c,
        vector: normalizeDeepEmbedding(raw, embeddingDim),
        qualityZ: Math.max(-1, Math.min(1, 0.5 - s * 0.2)),
      }));
    }
  }
  return Object.freeze({ identities, samplesPerIdentity, embeddingDim, samples: Object.freeze(samples) });
}

function crossEntropy(logits, targetIndex) {
  const max = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return -Math.log(exps[targetIndex] / sum);
}

export function runAngularMarginSmokeTraining({
  runSpec,
  batch,
  learningRate = 0.03,
} = {}) {
  if (!runSpec || !batch) fail("training_inputs_required", "runSpec and batch are required");
  if (runSpec.embeddingDim !== batch.embeddingDim) fail("dimension_mismatch", "runSpec and batch dimensions differ");
  if (!Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 1) fail("invalid_learning_rate", "learningRate out of range");

  const random = rng(runSpec.seed);
  let classWeights = Array.from({ length: batch.identities }, () =>
    normalizeDeepEmbedding(
      Array.from({ length: batch.embeddingDim }, () => random() - 0.5),
      batch.embeddingDim,
    ),
  );

  const epochLosses = [];
  for (let epoch = 0; epoch < runSpec.epochs; epoch += 1) {
    let loss = 0;
    for (const sample of batch.samples) {
      const result = createAngularMarginLogits({
        embedding: sample.vector,
        classWeights,
        targetIndex: sample.classIndex,
        scale: runSpec.scale,
        marginRadians: runSpec.marginRadians,
        qualityZ: runSpec.qualityAware ? sample.qualityZ : null,
      });
      loss += crossEntropy(result.logits, sample.classIndex);

      // Prototype-style deterministic update used only to validate training plumbing.
      // This is not CNN backpropagation and must not be represented as trained backbone weights.
      classWeights[sample.classIndex] = normalizeDeepEmbedding(
        classWeights[sample.classIndex].map(
          (w, i) => w * (1 - learningRate) + sample.vector[i] * learningRate,
        ),
        batch.embeddingDim,
      );
    }
    epochLosses.push(loss / batch.samples.length);
  }

  const sanitized = Object.freeze({
    runId: runSpec.runId,
    runSpecDigest: runSpec.digest,
    authorityBasis: runSpec.authorityBasis,
    epochs: runSpec.epochs,
    sampleCount: batch.samples.length,
    identityCount: batch.identities,
    initialLoss: epochLosses[0],
    finalLoss: epochLosses.at(-1),
    lossImproved: epochLosses.at(-1) <= epochLosses[0],
    checkpointDigest: sha256({
      weights: classWeights.map((w) => w.map((x) => Number(x.toFixed(12)))),
      runSpecDigest: runSpec.digest,
    }),
    backboneWeightsTrained: false,
    productionReady: false,
    biometricClaimReady: false,
  });

  return sanitized;
}
