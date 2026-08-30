import { inferSyntheticBackboneEmbedding } from "./backbone-inference-v1.mjs";
import { evaluateConsented1to1Scores } from "./consented-1to1-evaluator-v1.mjs";

export const TRUST_FACE_EMBEDDING_SCORE_ADAPTER_V1 = Object.freeze({
  version: "trust-face-embedding-score-adapter/v1",
  embeddingDim: 512,
  score: "cosine",
  syntheticOnly: true,
  realBiometricExecutionAuthorized: false,
  trainedBiometricWeightsRequiredForReal: true,
  realMetricsReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceEmbeddingScoreAdapterV1Error";
  error.code = code;
  throw error;
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 512 || b.length !== 512) {
    fail("invalid_embedding", "cosine inputs must be 512D embeddings");
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 512; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na * nb);
  if (!(denom > 0)) fail("invalid_embedding_norm", "embedding norm must be positive");
  return Math.max(-1, Math.min(1, dot / denom));
}

export function evaluateSyntheticProtocolWithBackbone({
  protocol,
  samplesById,
  checkpoint,
  thresholds = [0.5, 0.6, 0.7, 0.8, 0.9],
  execution = { mode: "synthetic", realBiometricExecutionAuthorized: false },
} = {}) {
  if (execution?.mode !== "synthetic") {
    fail(
      "real_biometric_execution_not_ready",
      "this adapter is synthetic-only until trained biometric weights and separate authorization exist",
    );
  }
  if (!protocol || !Array.isArray(protocol.pairs)) {
    fail("invalid_protocol", "protocol.pairs is required");
  }
  if (!samplesById || typeof samplesById !== "object" || Array.isArray(samplesById)) {
    fail("invalid_samples", "samplesById object is required");
  }

  const embeddingCache = new Map();
  const embeddingFor = (sampleId) => {
    if (embeddingCache.has(sampleId)) return embeddingCache.get(sampleId);
    const sample = samplesById[sampleId];
    if (!sample) fail("missing_sample", `missing synthetic sample ${sampleId}`);
    const result = inferSyntheticBackboneEmbedding({
      sample,
      checkpoint,
      execution: { mode: "synthetic", realBiometricInferenceAuthorized: false },
    });
    if (result.trainedBiometricWeightsIncluded !== false || result.biometricBackboneReady !== false) {
      fail("unsafe_backbone_state", "synthetic adapter requires an explicitly non-biometric checkpoint");
    }
    embeddingCache.set(sampleId, result.embedding);
    return result.embedding;
  };

  const scores = protocol.pairs.map((pair) => {
    const reference = embeddingFor(pair.referenceSampleId);
    const probe = embeddingFor(pair.probeSampleId);
    return Object.freeze({ pairId: pair.pairId, score: cosine(reference, probe) });
  });

  const evaluation = evaluateConsented1to1Scores({
    protocol,
    scores,
    thresholds,
    execution: { mode: "synthetic", realBiometricExecutionAuthorized: false },
  });

  return Object.freeze({
    adapterVersion: TRUST_FACE_EMBEDDING_SCORE_ADAPTER_V1.version,
    checkpointDigest: checkpoint?.checkpointDigest ?? null,
    embeddingDim: 512,
    scoreMethod: "cosine",
    executionMode: "synthetic",
    pairCount: scores.length,
    scores: Object.freeze(scores),
    operatingPoints: evaluation.operatingPoints,
    approximateEerPoint: evaluation.approximateEerPoint,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
