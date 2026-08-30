import { evaluateVerification } from "./metric-lab.mjs";

export const TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1 = Object.freeze({
  version: "trust-face-consented-1to1-evaluator/v1",
  authorityBasisRequired: "consented-lab",
  acceptedExecutionModes: Object.freeze(["synthetic", "consented-real"]),
  rawBiometricPayloadAccepted: false,
  rawEmbeddingAccepted: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceConsented1to1EvaluatorV1Error";
  error.code = code;
  throw error;
}

function assertNoRawPayload(record, index) {
  for (const field of ["pixels", "bytes", "buffer", "image", "imageData", "rawImage", "embedding", "template", "biometricTemplate", "referenceVector", "probeVector"]) {
    if (field in record) fail("raw_biometric_payload_forbidden", `scores[${index}].${field} is forbidden`);
  }
}

function pseudoVectorsForScore(score) {
  const bounded = Math.max(-1, Math.min(1, score));
  const residual = Math.sqrt(Math.max(0, 1 - bounded * bounded));
  return {
    referenceVector: Object.freeze([1, 0, 0]),
    probeVector: Object.freeze([bounded, residual, 0]),
  };
}

export function evaluateConsented1to1Scores({
  protocol,
  scores,
  thresholds = [0.5, 0.6, 0.7, 0.8, 0.9],
  execution = { mode: "synthetic", realBiometricExecutionAuthorized: false },
} = {}) {
  if (!protocol || typeof protocol !== "object" || !Array.isArray(protocol.pairs)) {
    fail("invalid_protocol", "protocol.pairs is required");
  }
  if (protocol.authorityBasis !== TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1.authorityBasisRequired) {
    fail("consented_lab_authority_required", "protocol authorityBasis must be consented-lab");
  }
  if (protocol.realMetricsReady !== false) {
    fail("protocol_metrics_state_invalid", "input protocol must enter with realMetricsReady=false");
  }
  if (!Array.isArray(scores) || scores.length !== protocol.pairs.length) {
    fail("score_coverage_mismatch", "scores must cover every protocol pair exactly once");
  }

  const mode = execution?.mode ?? "synthetic";
  if (!TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1.acceptedExecutionModes.includes(mode)) {
    fail("invalid_execution_mode", "execution.mode must be synthetic or consented-real");
  }
  if (mode === "consented-real" && execution?.realBiometricExecutionAuthorized !== true) {
    fail("real_biometric_execution_not_authorized", "consented-real execution requires explicit runtime authorization");
  }

  const protocolByPairId = new Map(protocol.pairs.map((pair) => [pair.pairId, pair]));
  const seen = new Set();
  const metricPairs = scores.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      fail("invalid_score_record", `scores[${index}] must be an object`);
    }
    assertNoRawPayload(record, index);
    if (typeof record.pairId !== "string" || !record.pairId.trim()) {
      fail("invalid_pair_id", `scores[${index}].pairId is required`);
    }
    if (seen.has(record.pairId)) fail("duplicate_pair_score", `duplicate score for ${record.pairId}`);
    seen.add(record.pairId);

    const pair = protocolByPairId.get(record.pairId);
    if (!pair) fail("unknown_pair_id", `score pairId ${record.pairId} is not present in protocol`);
    if (!Number.isFinite(record.score) || record.score < -1 || record.score > 1) {
      fail("invalid_pair_score", `score for ${record.pairId} must be finite between -1 and 1`);
    }

    const vectors = pseudoVectorsForScore(record.score);
    return Object.freeze({
      sameSubject: pair.sameSubject,
      referenceVector: vectors.referenceVector,
      probeVector: vectors.probeVector,
    });
  });

  if (seen.size !== protocolByPairId.size) {
    fail("score_coverage_mismatch", "scores must cover every protocol pair exactly once");
  }

  const identityMetricModel = Object.freeze({
    modelVersion: "trust-face-consented-1to1-score-adapter/v1",
    weights: Object.freeze([1, 1, 1]),
  });
  const evaluation = evaluateVerification({
    model: identityMetricModel,
    pairs: metricPairs,
    thresholds,
  });

  return Object.freeze({
    evaluatorVersion: TRUST_FACE_CONSENTED_1TO1_EVALUATOR_V1.version,
    protocolDigest: protocol.protocolDigest ?? null,
    authorityBasis: protocol.authorityBasis,
    executionMode: mode,
    pairCount: protocol.pairs.length,
    operatingPoints: evaluation.operatingPoints,
    approximateEerPoint: evaluation.approximateEerPoint,
    realMetricsReady: mode === "consented-real" && execution.realBiometricExecutionAuthorized === true,
    productionReady: false,
    biometricClaimReady: false,
  });
}
