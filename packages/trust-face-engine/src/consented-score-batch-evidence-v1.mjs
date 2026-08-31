import { createHash } from "node:crypto";
import { assertConsentedScoreSourceManifest } from "./consented-score-source-manifest-v1.mjs";

export const TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1 = Object.freeze({
  version: "trust-face-consented-score-batch-evidence/v1",
  purpose: "consented-1to1-evaluation",
  scoreSourceManifestRequired: true,
  rawBiometricPayloadAccepted: false,
  rawEmbeddingAccepted: false,
  trainingAuthorized: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceConsentedScoreBatchEvidenceV1Error";
  error.code = code;
  throw error;
}

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_evidence_field", `${field} is required`);
  return value.trim();
}

function requireSha256(value, field) {
  const normalized = required(value, field);
  if (!/^sha256:[0-9a-f]{64}$/i.test(normalized)) fail("invalid_evidence_digest", `${field} must be sha256:<64 hex>`);
  return normalized.toLowerCase();
}

function parseIso(value, field) {
  const normalized = required(value, field);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) fail("invalid_evidence_time", `${field} must be ISO-8601`);
  return Object.freeze({ iso: new Date(ms).toISOString(), ms });
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

function normalizeScores(scores) {
  if (!Array.isArray(scores) || scores.length === 0) fail("invalid_score_batch", "scores must be a non-empty array");
  const seen = new Set();
  const normalized = scores.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      fail("invalid_score_record", `scores[${index}] must be an object`);
    }
    for (const field of ["pixels", "bytes", "buffer", "image", "imageData", "rawImage", "embedding", "template", "biometricTemplate", "referenceVector", "probeVector"]) {
      if (field in record) fail("raw_biometric_payload_forbidden", `scores[${index}].${field} is forbidden`);
    }
    const pairId = required(record.pairId, `scores[${index}].pairId`);
    if (seen.has(pairId)) fail("duplicate_pair_score", `duplicate score for ${pairId}`);
    seen.add(pairId);
    if (!Number.isFinite(record.score) || record.score < -1 || record.score > 1) {
      fail("invalid_pair_score", `score for ${pairId} must be finite between -1 and 1`);
    }
    return Object.freeze({ pairId, score: record.score });
  });
  return Object.freeze(normalized.sort((a, b) => a.pairId.localeCompare(b.pairId)));
}

export function digestConsentedScoreBatch(scores) {
  return sha256(normalizeScores(scores));
}

function assertBoundSource({ scoreSourceManifest, protocolDigest, codeCommit, scorerVersion, capturedAt }) {
  try {
    return assertConsentedScoreSourceManifest({
      manifest: scoreSourceManifest,
      protocolDigest,
      codeCommit,
      scorerVersion,
      now: capturedAt,
    });
  } catch (cause) {
    const error = new Error(`score source manifest rejected: ${cause?.message ?? "unknown error"}`);
    error.name = "TrustFaceConsentedScoreBatchEvidenceV1Error";
    error.code = cause?.code === "score_source_manifest_required" ? "score_source_manifest_required" : "score_source_manifest_invalid";
    error.cause = cause;
    throw error;
  }
}

export function createConsentedScoreBatchEvidence({
  scores,
  protocolDigest,
  codeCommit,
  authorizationDigest,
  consentLedgerDigest,
  scorerVersion,
  scoreSourceManifest,
  capturedAt,
  rawBiometricsRetained = false,
  trainingUsed = false,
} = {}) {
  if (rawBiometricsRetained !== false) {
    fail("raw_biometrics_retention_forbidden", "rawBiometricsRetained must be false");
  }
  if (trainingUsed !== false) {
    fail("training_use_forbidden", "trainingUsed must be false");
  }

  const normalizedScores = normalizeScores(scores);
  const captured = parseIso(capturedAt, "capturedAt");
  const normalizedProtocolDigest = requireSha256(protocolDigest, "protocolDigest");
  const normalizedCodeCommit = required(codeCommit, "codeCommit");
  const normalizedScorerVersion = required(scorerVersion, "scorerVersion");
  const source = assertBoundSource({
    scoreSourceManifest,
    protocolDigest: normalizedProtocolDigest,
    codeCommit: normalizedCodeCommit,
    scorerVersion: normalizedScorerVersion,
    capturedAt: captured.iso,
  });

  const body = Object.freeze({
    version: TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1.version,
    purpose: TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1.purpose,
    scoreSetDigest: sha256(normalizedScores),
    pairCount: normalizedScores.length,
    protocolDigest: normalizedProtocolDigest,
    codeCommit: normalizedCodeCommit,
    authorizationDigest: requireSha256(authorizationDigest, "authorizationDigest"),
    consentLedgerDigest: requireSha256(consentLedgerDigest, "consentLedgerDigest"),
    scorerVersion: normalizedScorerVersion,
    scoreSourceManifestDigest: source.sourceManifestDigest,
    scoreSourceId: source.sourceId,
    scorerCodeDigest: source.scorerCodeDigest,
    checkpointManifestDigest: source.checkpointManifestDigest,
    weightsDigest: source.weightsDigest,
    capturedAt: captured.iso,
    rawBiometricsRetained: false,
    trainingUsed: false,
  });

  return Object.freeze({
    ...body,
    evidenceDigest: sha256(body),
    provenanceClass: "declared-consented-score-batch-with-owned-source",
    scoreSourceOriginAttested: source.originAttested === true,
    rawBiometricPayloadAccepted: false,
    rawEmbeddingAccepted: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function assertConsentedScoreBatchEvidence({
  evidence,
  scores,
  protocolDigest,
  codeCommit,
  authorizationDigest,
  scoreSourceManifest,
} = {}) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    fail("score_evidence_required", "consented-real execution requires score evidence");
  }
  if (evidence.version !== TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1.version) {
    fail("score_evidence_version_mismatch", "unsupported score evidence version");
  }
  if (evidence.purpose !== TRUST_FACE_CONSENTED_SCORE_BATCH_EVIDENCE_V1.purpose) {
    fail("score_evidence_purpose_mismatch", "score evidence purpose mismatch");
  }
  if (evidence.rawBiometricsRetained !== false || evidence.trainingUsed !== false) {
    fail("score_evidence_policy_mismatch", "score evidence must retain no raw biometrics and authorize no training");
  }

  const expectedScoreSetDigest = digestConsentedScoreBatch(scores);
  if (evidence.scoreSetDigest !== expectedScoreSetDigest) {
    fail("score_set_digest_mismatch", "score evidence does not match supplied score batch");
  }
  if (evidence.pairCount !== scores.length) {
    fail("score_evidence_pair_count_mismatch", "score evidence pairCount does not match supplied score batch");
  }

  const expectedProtocolDigest = requireSha256(protocolDigest, "protocolDigest");
  if (evidence.protocolDigest !== expectedProtocolDigest) {
    fail("score_evidence_protocol_mismatch", "score evidence protocolDigest mismatch");
  }
  const expectedCodeCommit = required(codeCommit, "codeCommit");
  if (evidence.codeCommit !== expectedCodeCommit) {
    fail("score_evidence_commit_mismatch", "score evidence codeCommit mismatch");
  }
  const expectedAuthorizationDigest = requireSha256(authorizationDigest, "authorizationDigest");
  if (evidence.authorizationDigest !== expectedAuthorizationDigest) {
    fail("score_evidence_authorization_mismatch", "score evidence authorizationDigest mismatch");
  }

  const captured = parseIso(evidence.capturedAt, "evidence.capturedAt");
  const scorerVersion = required(evidence.scorerVersion, "evidence.scorerVersion");
  const source = assertBoundSource({
    scoreSourceManifest,
    protocolDigest: expectedProtocolDigest,
    codeCommit: expectedCodeCommit,
    scorerVersion,
    capturedAt: captured.iso,
  });
  if (evidence.scoreSourceManifestDigest !== source.sourceManifestDigest) {
    fail("score_source_manifest_digest_mismatch", "score evidence scoreSourceManifestDigest mismatch");
  }
  if (evidence.scoreSourceId !== source.sourceId) fail("score_source_id_mismatch", "score evidence scoreSourceId mismatch");
  if (evidence.scorerCodeDigest !== source.scorerCodeDigest) fail("score_source_code_digest_mismatch", "score evidence scorerCodeDigest mismatch");
  if (evidence.checkpointManifestDigest !== source.checkpointManifestDigest) fail("score_source_checkpoint_digest_mismatch", "score evidence checkpointManifestDigest mismatch");
  if (evidence.weightsDigest !== source.weightsDigest) fail("score_source_weights_digest_mismatch", "score evidence weightsDigest mismatch");

  const body = Object.freeze({
    version: evidence.version,
    purpose: evidence.purpose,
    scoreSetDigest: evidence.scoreSetDigest,
    pairCount: evidence.pairCount,
    protocolDigest: evidence.protocolDigest,
    codeCommit: evidence.codeCommit,
    authorizationDigest: evidence.authorizationDigest,
    consentLedgerDigest: requireSha256(evidence.consentLedgerDigest, "evidence.consentLedgerDigest"),
    scorerVersion,
    scoreSourceManifestDigest: evidence.scoreSourceManifestDigest,
    scoreSourceId: evidence.scoreSourceId,
    scorerCodeDigest: evidence.scorerCodeDigest,
    checkpointManifestDigest: evidence.checkpointManifestDigest,
    weightsDigest: evidence.weightsDigest,
    capturedAt: captured.iso,
    rawBiometricsRetained: false,
    trainingUsed: false,
  });
  const expectedEvidenceDigest = sha256(body);
  if (evidence.evidenceDigest !== expectedEvidenceDigest) {
    fail("score_evidence_digest_mismatch", "score evidence digest mismatch");
  }

  return Object.freeze({
    valid: true,
    evidenceDigest: expectedEvidenceDigest,
    scoreSetDigest: expectedScoreSetDigest,
    consentLedgerDigest: body.consentLedgerDigest,
    scorerVersion: body.scorerVersion,
    capturedAt: body.capturedAt,
    scoreSourceManifestDigest: source.sourceManifestDigest,
    scoreSourceId: source.sourceId,
    scorerCodeDigest: source.scorerCodeDigest,
    checkpointManifestDigest: source.checkpointManifestDigest,
    weightsDigest: source.weightsDigest,
    provenanceClass: "declared-consented-score-batch-with-owned-source",
    scoreSourceOriginAttested: source.originAttested === true,
    rawBiometricsRetained: false,
    trainingUsed: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
