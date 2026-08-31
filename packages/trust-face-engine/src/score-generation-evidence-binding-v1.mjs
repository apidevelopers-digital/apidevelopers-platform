import { createHash } from "node:crypto";
import { assertConsentedScoreGenerationReceipt } from "./consented-score-generation-receipt-v1.mjs";
import { assertConsentedScoreBatchEvidence } from "./consented-score-batch-evidence-v1.mjs";

export const TRUST_FACE_SCORE_GENERATION_EVIDENCE_BINDING_V1 = Object.freeze({
  version: "trust-face-score-generation-evidence-binding/v1",
  purpose: "bind-consented-score-generation-to-score-batch-evidence",
  evaluationOnly: true,
  trainingAuthorized: false,
  rawBiometricPayloadAccepted: false,
  rawEmbeddingAccepted: false,
  originAttested: false,
  realMetricsReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceScoreGenerationEvidenceBindingV1Error";
  error.code = code;
  throw error;
}

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_generation_evidence_binding_field", `${field} is required`);
  }
  return value.trim();
}

function digest(value, field) {
  const normalized = required(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    fail("invalid_generation_evidence_binding_digest", `${field} must be sha256:<64 hex>`);
  }
  return normalized;
}

function commit(value) {
  const normalized = required(value, "codeCommit").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    fail("invalid_generation_evidence_binding_commit", "codeCommit must be a 40-hex git commit");
  }
  return normalized;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

function parseIso(value, field) {
  const normalized = required(value, field);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) {
    fail("invalid_generation_evidence_binding_time", `${field} must be ISO-8601`);
  }
  return Object.freeze({ iso: new Date(ms).toISOString(), ms });
}

function assertBindingPolicy(binding) {
  if (
    binding.evaluationOnly !== true ||
    binding.trainingAuthorized !== false ||
    binding.rawBiometricPayloadAccepted !== false ||
    binding.rawEmbeddingAccepted !== false ||
    binding.originAttested !== false ||
    binding.realMetricsReady !== false ||
    binding.productionReady !== false ||
    binding.biometricClaimReady !== false
  ) {
    fail(
      "generation_evidence_binding_policy_mismatch",
      "generation/evidence binding must remain evaluation-only, non-training, raw-payload-free, unattested, non-production and non-claim-ready",
    );
  }
}

function verifyLinkedInputs({
  generationReceipt,
  scoreEvidence,
  scores,
  scoreSourceManifest,
  protocolDigest,
  codeCommit,
  authorizationDigest,
  consentLedgerDigest,
  scorerVersion,
  now = null,
} = {}) {
  const normalizedProtocolDigest = digest(protocolDigest, "protocolDigest");
  const normalizedCommit = commit(codeCommit);
  const normalizedAuthorizationDigest = digest(authorizationDigest, "authorizationDigest");
  const normalizedConsentLedgerDigest = digest(consentLedgerDigest, "consentLedgerDigest");
  const normalizedScorerVersion = required(scorerVersion, "scorerVersion");

  const evidence = assertConsentedScoreBatchEvidence({
    evidence: scoreEvidence,
    scores,
    protocolDigest: normalizedProtocolDigest,
    codeCommit: normalizedCommit,
    authorizationDigest: normalizedAuthorizationDigest,
    scoreSourceManifest,
  });

  if (evidence.consentLedgerDigest !== normalizedConsentLedgerDigest) {
    fail(
      "generation_evidence_consent_ledger_digest_mismatch",
      "score evidence consentLedgerDigest does not match expected consent ledger",
    );
  }

  const receipt = assertConsentedScoreGenerationReceipt({
    receipt: generationReceipt,
    protocolDigest: normalizedProtocolDigest,
    codeCommit: normalizedCommit,
    authorizationDigest: normalizedAuthorizationDigest,
    consentLedgerDigest: normalizedConsentLedgerDigest,
    scoreSourceManifestDigest: evidence.scoreSourceManifestDigest,
    checkpointManifestDigest: evidence.checkpointManifestDigest,
    weightsDigest: evidence.weightsDigest,
    scorerCodeDigest: evidence.scorerCodeDigest,
    scorerVersion: evidence.scorerVersion,
    scoreSetDigest: evidence.scoreSetDigest,
    pairCount: scores.length,
    now,
  });

  if (receipt.scoreSetDigest !== evidence.scoreSetDigest) {
    fail("generation_evidence_score_set_digest_mismatch", "generation receipt and score evidence scoreSetDigest mismatch");
  }
  if (receipt.pairCount !== scores.length) {
    fail("generation_evidence_pair_count_mismatch", "generation receipt pairCount does not match supplied score batch");
  }
  if (receipt.scoreSourceManifestDigest !== evidence.scoreSourceManifestDigest) {
    fail(
      "generation_evidence_source_manifest_digest_mismatch",
      "generation receipt and score evidence scoreSourceManifestDigest mismatch",
    );
  }
  if (receipt.checkpointManifestDigest !== evidence.checkpointManifestDigest) {
    fail(
      "generation_evidence_checkpoint_manifest_digest_mismatch",
      "generation receipt and score evidence checkpointManifestDigest mismatch",
    );
  }
  if (receipt.weightsDigest !== evidence.weightsDigest) {
    fail("generation_evidence_weights_digest_mismatch", "generation receipt and score evidence weightsDigest mismatch");
  }
  if (receipt.scorerCodeDigest !== evidence.scorerCodeDigest) {
    fail(
      "generation_evidence_scorer_code_digest_mismatch",
      "generation receipt and score evidence scorerCodeDigest mismatch",
    );
  }
  if (receipt.scorerVersion !== evidence.scorerVersion || receipt.scorerVersion !== normalizedScorerVersion) {
    fail("generation_evidence_scorer_version_mismatch", "generation receipt and score evidence scorerVersion mismatch");
  }

  const completed = parseIso(receipt.completedAt, "generationReceipt.completedAt");
  const captured = parseIso(evidence.capturedAt, "scoreEvidence.capturedAt");
  if (completed.ms > captured.ms) {
    fail(
      "generation_evidence_time_order_mismatch",
      "generation receipt completedAt must be at or before score evidence capturedAt",
    );
  }

  return Object.freeze({
    receipt,
    evidence,
    protocolDigest: normalizedProtocolDigest,
    codeCommit: normalizedCommit,
    authorizationDigest: normalizedAuthorizationDigest,
    consentLedgerDigest: normalizedConsentLedgerDigest,
    scorerVersion: normalizedScorerVersion,
    generationCompletedAt: completed.iso,
    evidenceCapturedAt: captured.iso,
  });
}

function bindingBody(linked) {
  return Object.freeze({
    version: TRUST_FACE_SCORE_GENERATION_EVIDENCE_BINDING_V1.version,
    purpose: TRUST_FACE_SCORE_GENERATION_EVIDENCE_BINDING_V1.purpose,
    generationReceiptDigest: linked.receipt.generationReceiptDigest,
    scoreEvidenceDigest: linked.evidence.evidenceDigest,
    scoreSetDigest: linked.evidence.scoreSetDigest,
    pairCount: linked.receipt.pairCount,
    protocolDigest: linked.protocolDigest,
    codeCommit: linked.codeCommit,
    authorizationDigest: linked.authorizationDigest,
    consentLedgerDigest: linked.consentLedgerDigest,
    scoreSourceManifestDigest: linked.evidence.scoreSourceManifestDigest,
    checkpointManifestDigest: linked.evidence.checkpointManifestDigest,
    weightsDigest: linked.evidence.weightsDigest,
    scorerCodeDigest: linked.evidence.scorerCodeDigest,
    scorerVersion: linked.scorerVersion,
    generationCompletedAt: linked.generationCompletedAt,
    evidenceCapturedAt: linked.evidenceCapturedAt,
    evaluationOnly: true,
    trainingAuthorized: false,
    rawBiometricPayloadAccepted: false,
    rawEmbeddingAccepted: false,
    originAttested: false,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function createScoreGenerationEvidenceBinding(input = {}) {
  const linked = verifyLinkedInputs(input);
  const body = bindingBody(linked);
  return Object.freeze({
    ...body,
    bindingDigest: sha256(body),
  });
}

export function assertScoreGenerationEvidenceBinding({
  binding,
  generationReceipt,
  scoreEvidence,
  scores,
  scoreSourceManifest,
  protocolDigest,
  codeCommit,
  authorizationDigest,
  consentLedgerDigest,
  scorerVersion,
  now = null,
} = {}) {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    fail("generation_evidence_binding_required", "generation/evidence binding is required");
  }
  if (binding.version !== TRUST_FACE_SCORE_GENERATION_EVIDENCE_BINDING_V1.version) {
    fail("generation_evidence_binding_version_mismatch", "unsupported generation/evidence binding version");
  }
  if (binding.purpose !== TRUST_FACE_SCORE_GENERATION_EVIDENCE_BINDING_V1.purpose) {
    fail("generation_evidence_binding_purpose_mismatch", "generation/evidence binding purpose mismatch");
  }
  assertBindingPolicy(binding);

  const linked = verifyLinkedInputs({
    generationReceipt,
    scoreEvidence,
    scores,
    scoreSourceManifest,
    protocolDigest,
    codeCommit: normalizedCommit,
    authorizationDigest,
    consentLedgerDigest,
    scorerVersion,
    now,
  });
  const body = bindingBody(linked);
  const expectedDigest = sha256(body);

  for (const [field, value] of Object.entries(body)) {
    if (binding[field] !== value) {
      fail(`generation_evidence_binding_${field}_mismatch`, `generation/evidence binding ${field} mismatch`);
    }
  }
  if (binding.bindingDigest !== expectedDigest) {
    fail("generation_evidence_binding_digest_mismatch", "generation/evidence binding digest mismatch");
  }

  return Object.freeze({
    valid: true,
    bindingDigest: expectedDigest,
    generationReceiptDigest: body.generationReceiptDigest,
    scoreEvidenceDigest: body.scoreEvidenceDigest,
    scoreSetDigest: body.scoreSetDigest,
    pairCount: body.pairCount,
    scoreSourceManifestDigest: body.scoreSourceManifestDigest,
    checkpointManifestDigest: body.checkpointManifestDigest,
    weightsDigest: body.weightsDigest,
    scorerCodeDigest: body.scorerCodeDigest,
    scorerVersion: body.scorerVersion,
    generationCompletedAt: body.generationCompletedAt,
    evidenceCapturedAt: body.evidenceCapturedAt,
    originAttested: false,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
