import { createHash } from "node:crypto";

export const TRUST_FACE_CONSENTED_SCORE_GENERATION_RECEIPT_V1 = Object.freeze({
  version: "trust-face-consented-score-generation-receipt/v1",
  purpose: "consented-1to1-score-generation",
  executionMode: "declared-consented-score-generation",
  evaluationOnly: true,
  trainingUsed: false,
  rawBiometricsRetained: false,
  rawEmbeddingsRetained: false,
  originAttested: false,
  realMetricsReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceConsentedScoreGenerationReceiptV1Error";
  error.code = code;
  throw error;
}

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_generation_field", `${field} is required`);
  return value.trim();
}

function requireSha256(value, field) {
  const normalized = required(value, field);
  if (!/^sha256:[0-9a-f]{64}$/i.test(normalized)) fail("invalid_generation_digest", `${field} must be sha256:<64 hex>`);
  return normalized.toLowerCase();
}

function requireCommit(value) {
  const normalized = required(value, "codeCommit");
  if (!/^[0-9a-f]{40}$/i.test(normalized)) fail("invalid_generation_commit", "codeCommit must be a 40-hex git commit");
  return normalized.toLowerCase();
}

function requirePositiveInt(value, field) {
  if (!Number.isInteger(value) || value < 1 || value > 10000000) fail("invalid_generation_count", `${field} must be a positive integer`);
  return value;
}

function parseIso(value, field) {
  const normalized = required(value, field);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) fail("invalid_generation_time", `${field} must be ISO-8601`);
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

export function createConsentedScoreGenerationReceipt({
  generationId,
  protocolDigest,
  codeCommit,
  authorizationDigest,
  consentLedgerDigest,
  scoreSourceManifestDigest,
  checkpointManifestDigest,
  weightsDigest,
  scorerCodeDigest,
  scorerVersion,
  scoreSetDigest,
  pairCount,
  startedAt,
  completedAt,
  evaluationOnly = true,
  trainingUsed = false,
  rawBiometricsRetained = false,
  rawEmbeddingsRetained = false,
} = {}) {
  if (evaluationOnly !== true) fail("generation_evaluation_only_required", "evaluationOnly must be true");
  if (trainingUsed !== false) fail("generation_training_forbidden", "trainingUsed must be false");
  if (rawBiometricsRetained !== false) fail("generation_raw_biometrics_retention_forbidden", "rawBiometricsRetained must be false");
  if (rawEmbeddingsRetained !== false) fail("generation_raw_embeddings_retention_forbidden", "rawEmbeddingsRetained must be false");

  const started = parseIso(startedAt, "startedAt");
  const completed = parseIso(completedAt, "completedAt");
  if (completed.ms <= started.ms) fail("generation_invalid_window", "completedAt must be after startedAt");

  const body = Object.freeze({
    version: TRUST_FACE_CONSENTED_SCORE_GENERATION_RECEIPT_V1.version,
    purpose: TRUST_FACE_CONSENTED_SCORE_GENERATION_RECEIPT_V1.purpose,
    executionMode: TRUST_FACE_CONSENTED_SCORE_GENERATION_RECEIPT_V1.executionMode,
    generationId: required(generationId, "generationId"),
    protocolDigest: requireSha256(protocolDigest, "protocolDigest"),
    codeCommit: requireCommit(codeCommit),
    authorizationDigest: requireSha256(authorizationDigest, "authorizationDigest"),
    consentLedgerDigest: requireSha256(consentLedgerDigest, "consentLedgerDigest"),
    scoreSourceManifestDigest: requireSha256(scoreSourceManifestDigest, "scoreSourceManifestDigest"),
    checkpointManifestDigest: requireSha256(checkpointManifestDigest, "checkpointManifestDigest"),
    weightsDigest: requireSha256(weightsDigest, "weightsDigest"),
    scorerCodeDigest: requireSha256(scorerCodeDigest, "scorerCodeDigest"),
    scorerVersion: required(scorerVersion, "scorerVersion"),
    scoreSetDigest: requireSha256(scoreSetDigest, "scoreSetDigest"),
    pairCount: requirePositiveInt(pairCount, "pairCount"),
    startedAt: started.iso,
    completedAt: completed.iso,
    evaluationOnly: true,
    trainingUsed: false,
    rawBiometricsRetained: false,
    rawEmbeddingsRetained: false,
  });

  return Object.freeze({
    ...body,
    generationReceiptDigest: sha256(body),
    provenanceClass: "declared-consented-score-generation",
    originAttested: false,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function assertConsentedScoreGenerationReceipt({
  receipt,
  protocolDigest,
  codeCommit,
  authorizationDigest,
  consentLedgerDigest,
  scoreSourceManifestDigest,
  checkpointManifestDigest,
  weightsDigest,
  scorerCodeDigest,
  scorerVersion,
  scoreSetDigest,
  pairCount,
  now = null,
} = {}) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) fail("generation_receipt_required", "score generation receipt is required");
  if (receipt.version !== TRUST_FACE_CONSENTED_SCORE_GENERATION_RECEIPT_V1.version) fail("generation_receipt_version_mismatch", "unsupported score generation receipt version");
  if (receipt.purpose !== TRUST_FACE_CONSENTED_SCORE_GENERATION_RECEIPT_V1.purpose || receipt.executionMode !== TRUST_FACE_CONSENTED_SCORE_GENERATION_RECEIPT_V1.executionMode) {
    fail("generation_receipt_purpose_mismatch", "score generation receipt purpose/executionMode mismatch");
  }
  if (receipt.evaluationOnly !== true || receipt.trainingUsed !== false || receipt.rawBiometricsRetained !== false || receipt.rawEmbeddingsRetained !== false) {
    fail("generation_receipt_policy_mismatch", "score generation receipt policy mismatch");
  }

  const started = parseIso(receipt.startedAt, "receipt.startedAt");
  const completed = parseIso(receipt.completedAt, "receipt.completedAt");
  if (completed.ms <= started.ms) fail("generation_invalid_window", "receipt completedAt must be after startedAt");
  if (now !== null && parseIso(now, "now").ms < completed.ms) fail("generation_receipt_from_future", "score generation receipt completedAt is after now");

  const body = Object.freeze({
    version: receipt.version,
    purpose: receipt.purpose,
    executionMode: receipt.executionMode,
    generationId: required(receipt.generationId, "receipt.generationId"),
    protocolDigest: requireSha256(receipt.protocolDigest, "receipt.protocolDigest"),
    codeCommit: requireCommit(receipt.codeCommit),
    authorizationDigest: requireSha256(receipt.authorizationDigest, "receipt.authorizationDigest"),
    consentLedgerDigest: requireSha256(receipt.consentLedgerDigest, "receipt.consentLedgerDigest"),
    scoreSourceManifestDigest: requireSha256(receipt.scoreSourceManifestDigest, "receipt.scoreSourceManifestDigest"),
    checkpointManifestDigest: requireSha256(receipt.checkpointManifestDigest, "receipt.checkpointManifestDigest"),
    weightsDigest: requireSha256(receipt.weightsDigest, "receipt.weightsDigest"),
    scorerCodeDigest: requireSha256(receipt.scorerCodeDigest, "receipt.scorerCodeDigest"),
    scorerVersion: required(receipt.scorerVersion, "receipt.scorerVersion"),
    scoreSetDigest: requireSha256(receipt.scoreSetDigest, "receipt.scoreSetDigest"),
    pairCount: requirePositiveInt(receipt.pairCount, "receipt.pairCount"),
    startedAt: started.iso,
    completedAt: completed.iso,
    evaluationOnly: true,
    trainingUsed: false,
    rawBiometricsRetained: false,
    rawEmbeddingsRetained: false,
  });

  const expectedReceiptDigest = sha256(body);
  if (receipt.generationReceiptDigest !== expectedReceiptDigest) fail("generation_receipt_digest_mismatch", "score generation receipt digest mismatch");

  const expected = Object.freeze({
    protocolDigest: requireSha256(protocolDigest, "protocolDigest"),
    codeCommit: requireCommit(codeCommit),
    authorizationDigest: requireSha256(authorizationDigest, "authorizationDigest"),
    consentLedgerDigest: requireSha256(consentLedgerDigest, "consentLedgerDigest"),
    scoreSourceManifestDigest: requireSha256(scoreSourceManifestDigest, "scoreSourceManifestDigest"),
    checkpointManifestDigest: requireSha256(checkpointManifestDigest, "checkpointManifestDigest"),
    weightsDigest: requireSha256(weightsDigest, "weightsDigest"),
    scorerCodeDigest: requireSha256(scorerCodeDigest, "scorerCodeDigest"),
    scorerVersion: required(scorerVersion, "scorerVersion"),
    scoreSetDigest: requireSha256(scoreSetDigest, "scoreSetDigest"),
    pairCount: requirePositiveInt(pairCount, "pairCount"),
  });

  for (const [field, value] of Object.entries(expected)) {
    if (body[field] !== value) fail(`generation_${field}_mismatch`, `score generation receipt ${field} mismatch`);
  }

  return Object.freeze({
    valid: true,
    generationId: body.generationId,
    generationReceiptDigest: expectedReceiptDigest,
    scoreSetDigest: body.scoreSetDigest,
    pairCount: body.pairCount,
    scoreSourceManifestDigest: body.scoreSourceManifestDigest,
    checkpointManifestDigest: body.checkpointManifestDigest,
    weightsDigest: body.weightsDigest,
    scorerCodeDigest: body.scorerCodeDigest,
    scorerVersion: body.scorerVersion,
    completedAt: body.completedAt,
    provenanceClass: "declared-consented-score-generation",
    originAttested: false,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
