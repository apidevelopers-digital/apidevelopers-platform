import { createHash } from "node:crypto";

export const TRUST_FACE_CONSENTED_SCORE_SOURCE_MANIFEST_V1 = Object.freeze({
  version: "trust-face-consented-score-source-manifest/v1",
  purpose: "consented-1to1-score-generation",
  authorityBasisRequired: "owned-checkpoint",
  embeddingDim: 512,
  similarityMetric: "cosine",
  normalization: "l2",
  evaluationOnly: true,
  trainingAuthorized: false,
  rawBiometricsRetained: false,
  originAttested: false,
  realMetricsReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceConsentedScoreSourceManifestV1Error";
  error.code = code;
  throw error;
}
function text(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_score_source_field", `${field} is required`);
  return value.trim();
}
function digest(value, field) {
  const normalized = text(value, field);
  if (!/^sha256:[0-9a-f]{64}$/i.test(normalized)) fail("invalid_score_source_digest", `${field} must be sha256:<64 hex>`);
  return normalized.toLowerCase();
}
function instant(value, field) {
  const iso = text(value, field);
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) fail("invalid_score_source_time", `${field} must be ISO-8601`);
  return { iso: new Date(ms).toISOString(), ms };
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function hash(value) {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

export function createConsentedScoreSourceManifest(input = {}) {
  const {
    sourceId, authorityBasis = "owned-checkpoint", protocolDigest, codeCommit,
    scorerCodeDigest, checkpointManifestDigest, weightsDigest, scorerVersion,
    embeddingDim = 512, similarityMetric = "cosine", normalization = "l2",
    issuedAt, expiresAt, evaluationOnly = true, trainingAuthorized = false,
    rawBiometricsRetained = false,
  } = input;

  if (authorityBasis !== "owned-checkpoint") fail("score_source_authority_mismatch", "authorityBasis must be owned-checkpoint");
  if (embeddingDim !== 512) fail("score_source_embedding_dim_mismatch", "embeddingDim must be 512");
  if (similarityMetric !== "cosine") fail("score_source_metric_mismatch", "similarityMetric must be cosine");
  if (normalization !== "l2") fail("score_source_normalization_mismatch", "normalization must be l2");
  if (evaluationOnly !== true) fail("score_source_evaluation_only_required", "evaluationOnly must be true");
  if (trainingAuthorized !== false) fail("score_source_training_forbidden", "trainingAuthorized must be false");
  if (rawBiometricsRetained !== false) fail("score_source_raw_retention_forbidden", "rawBiometricsRetained must be false");

  const issued = instant(issuedAt, "issuedAt");
  const expires = instant(expiresAt, "expiresAt");
  if (expires.ms <= issued.ms) fail("score_source_invalid_window", "expiresAt must be after issuedAt");

  const body = Object.freeze({
    version: TRUST_FACE_CONSENTED_SCORE_SOURCE_MANIFEST_V1.version,
    purpose: TRUST_FACE_CONSENTED_SCORE_SOURCE_MANIFEST_V1.purpose,
    sourceId: text(sourceId, "sourceId"),
    authorityBasis,
    protocolDigest: digest(protocolDigest, "protocolDigest"),
    codeCommit: text(codeCommit, "codeCommit"),
    scorerCodeDigest: digest(scorerCodeDigest, "scorerCodeDigest"),
    checkpointManifestDigest: digest(checkpointManifestDigest, "checkpointManifestDigest"),
    weightsDigest: digest(weightsDigest, "weightsDigest"),
    scorerVersion: text(scorerVersion, "scorerVersion"),
    embeddingDim, similarityMetric, normalization,
    issuedAt: issued.iso, expiresAt: expires.iso,
    evaluationOnly: true, trainingAuthorized: false, rawBiometricsRetained: false,
  });

  return Object.freeze({
    ...body,
    sourceManifestDigest: hash(body),
    provenanceClass: "declared-owned-score-source",
    originAttested: false,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function assertConsentedScoreSourceManifest({ manifest, protocolDigest, codeCommit, scorerVersion, now } = {}) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) fail("score_source_manifest_required", "score source manifest is required");
  if (manifest.version !== TRUST_FACE_CONSENTED_SCORE_SOURCE_MANIFEST_V1.version) fail("score_source_version_mismatch", "unsupported score source manifest version");
  if (manifest.purpose !== TRUST_FACE_CONSENTED_SCORE_SOURCE_MANIFEST_V1.purpose) fail("score_source_purpose_mismatch", "score source manifest purpose mismatch");
  if (manifest.authorityBasis !== "owned-checkpoint") fail("score_source_authority_mismatch", "authorityBasis must be owned-checkpoint");
  if (manifest.evaluationOnly !== true || manifest.trainingAuthorized !== false || manifest.rawBiometricsRetained !== false) {
    fail("score_source_policy_mismatch", "score source policy mismatch");
  }
  if (manifest.embeddingDim !== 512 || manifest.similarityMetric !== "cosine" || manifest.normalization !== "l2") {
    fail("score_source_geometry_mismatch", "score source geometry/metric contract mismatch");
  }

  const issued = instant(manifest.issuedAt, "manifest.issuedAt");
  const expires = instant(manifest.expiresAt, "manifest.expiresAt");
  if (expires.ms <= issued.ms) fail("score_source_invalid_window", "manifest expiresAt must be after issuedAt");
  const current = instant(now, "now");
  if (current.ms < issued.ms || current.ms >= expires.ms) fail("score_source_not_active", "score source manifest is not active at now");
  if (manifest.protocolDigest !== digest(protocolDigest, "protocolDigest")) fail("score_source_protocol_mismatch", "score source protocolDigest mismatch");
  if (manifest.codeCommit !== text(codeCommit, "codeCommit")) fail("score_source_commit_mismatch", "score source codeCommit mismatch");
  if (manifest.scorerVersion !== text(scorerVersion, "scorerVersion")) fail("score_source_scorer_version_mismatch", "score source scorerVersion mismatch");

  const body = Object.freeze({
    version: manifest.version, purpose: manifest.purpose,
    sourceId: text(manifest.sourceId, "manifest.sourceId"),
    authorityBasis: manifest.authorityBasis,
    protocolDigest: digest(manifest.protocolDigest, "manifest.protocolDigest"),
    codeCommit: text(manifest.codeCommit, "manifest.codeCommit"),
    scorerCodeDigest: digest(manifest.scorerCodeDigest, "manifest.scorerCodeDigest"),
    checkpointManifestDigest: digest(manifest.checkpointManifestDigest, "manifest.checkpointManifestDigest"),
    weightsDigest: digest(manifest.weightsDigest, "manifest.weightsDigest"),
    scorerVersion: text(manifest.scorerVersion, "manifest.scorerVersion"),
    embeddingDim: 512, similarityMetric: "cosine", normalization: "l2",
    issuedAt: issued.iso, expiresAt: expires.iso,
    evaluationOnly: true, trainingAuthorized: false, rawBiometricsRetained: false,
  });
  const expected = hash(body);
  if (manifest.sourceManifestDigest !== expected) fail("score_source_manifest_digest_mismatch", "score source manifest digest mismatch");

  return Object.freeze({
    valid: true,
    sourceId: body.sourceId,
    sourceManifestDigest: expected,
    scorerCodeDigest: body.scorerCodeDigest,
    checkpointManifestDigest: body.checkpointManifestDigest,
    weightsDigest: body.weightsDigest,
    scorerVersion: body.scorerVersion,
    provenanceClass: "declared-owned-score-source",
    originAttested: false,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
