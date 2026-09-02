import { createHash } from "node:crypto";

export const TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1 = Object.freeze({
  version: "trust-face-production-readiness-review-gate/v1",
  mode: "governance-metadata-only",
  requiredEvidenceCategories: Object.freeze([
    "image-embedding-inference",
    "face-detector",
    "landmark-alignment",
    "liveness-pad",
    "template-vault-kms",
    "revocation-erasure",
    "production-sdk",
    "biometric-benchmarks",
  ]),
  requiredEvidenceEnvironment: "production",
  requiredAssessmentScope: "external-independent",
  metadataOnly: true,
  evidenceClassificationRequired: true,
  evidenceAuthenticityVerified: false,
  externalEvidenceVerifierIntegrated: false,
  independentValidationVerified: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceProductionReadinessReviewGateV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceProductionReadinessReviewGateV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceProductionReadinessReviewGateV1Error(code, message);
};

const req = (value, field) => {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_readiness_field", `${field} is required`);
  }
  return value.trim();
};

const digest = (value, field) => {
  const normalized = req(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    fail("invalid_readiness_digest", `${field} must be sha256:<64 hex>`);
  }
  return normalized;
};

const iso = (value, field) => {
  const normalized = req(value, field);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) {
    fail("invalid_readiness_time", `${field} must be ISO-8601`);
  }
  return new Date(ms).toISOString();
};

const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha = (value) => `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;

const forbidden = new Set([
  "image", "imageData", "rawImage", "pixels", "video", "videoData", "frames", "bytes", "buffer",
  "embedding", "embeddings", "vector", "vectors", "template", "biometricTemplate", "templatePayload",
  "ciphertext", "encryptedPayload", "encryptedTemplate", "payload", "privateKey", "publicKey", "keyMaterial",
  "kmsMaterial", "secret", "secretMaterial", "plaintext", "signature", "token", "password",
]);

function rejectSensitive(value, seen = new Set()) {
  if (value == null || typeof value !== "object") return;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    fail("readiness_binary_forbidden", "binary input is forbidden");
  }
  if (seen.has(value)) {
    fail("readiness_circular_input", "circular input is forbidden");
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) {
      fail("readiness_sensitive_payload_forbidden", `${key} is forbidden`);
    }
    rejectSensitive(child, seen);
  }
  seen.delete(value);
}

function normalize(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    fail("readiness_evidence_required", "evidence record is required");
  }
  rejectSensitive(record);

  const category = req(record.category, "category");
  if (!TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1.requiredEvidenceCategories.includes(category)) {
    fail("readiness_unknown_category", `unknown category ${category}`);
  }

  const status = req(record.status, "status");
  if (!["pass", "fail"].includes(status)) {
    fail("readiness_invalid_status", "status must be pass or fail");
  }

  return Object.freeze({
    evidenceId: req(record.evidenceId, "evidenceId"),
    category,
    artifactDigest: digest(record.artifactDigest, "artifactDigest"),
    sourceRef: req(record.sourceRef, "sourceRef"),
    assessorRef: req(record.assessorRef, "assessorRef"),
    assessedAt: iso(record.assessedAt, "assessedAt"),
    status,
    evidenceEnvironment: req(record.evidenceEnvironment, "evidenceEnvironment"),
    assessmentScope: req(record.assessmentScope, "assessmentScope"),
    independentAssessmentDeclared: record.independentAssessmentDeclared === true,
    authenticityVerifiedByThisGate: false,
  });
}

function blockerFor(evidence) {
  if (!evidence) return "missing-evidence";
  if (evidence.status !== "pass") return "evidence-failed";
  if (evidence.evidenceEnvironment !== TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1.requiredEvidenceEnvironment) {
    return "evidence-environment-not-production";
  }
  if (evidence.assessmentScope !== TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1.requiredAssessmentScope) {
    return "assessment-scope-not-external-independent";
  }
  if (!evidence.independentAssessmentDeclared) return "independent-assessment-not-declared";
  return null;
}

function build({ evidenceRecords, evaluatedAt }) {
  if (!Array.isArray(evidenceRecords)) {
    fail("readiness_evidence_list_required", "evidenceRecords must be an array");
  }

  const records = evidenceRecords.map(normalize);
  const byCategory = new Map();
  const ids = new Set();
  const digests = new Set();

  for (const record of records) {
    if (byCategory.has(record.category)) {
      fail("readiness_duplicate_category", `duplicate category ${record.category}`);
    }
    if (ids.has(record.evidenceId)) {
      fail("readiness_duplicate_evidence_id", `duplicate evidenceId ${record.evidenceId}`);
    }
    if (digests.has(record.artifactDigest)) {
      fail("readiness_duplicate_artifact_digest", `duplicate artifactDigest ${record.artifactDigest}`);
    }
    byCategory.set(record.category, record);
    ids.add(record.evidenceId);
    digests.add(record.artifactDigest);
  }

  const categories = TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1.requiredEvidenceCategories.map((category) => {
    const evidence = byCategory.get(category) ?? null;
    return Object.freeze({ category, evidence, blocker: blockerFor(evidence) });
  });

  const blockers = categories
    .filter((item) => item.blocker)
    .map((item) => Object.freeze({ category: item.category, blocker: item.blocker }));

  const reviewEligible = blockers.length === 0;

  const body = Object.freeze({
    version: TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1.version,
    mode: TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1.mode,
    evaluatedAt: iso(evaluatedAt, "evaluatedAt"),
    requiredEvidenceEnvironment: TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1.requiredEvidenceEnvironment,
    requiredAssessmentScope: TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1.requiredAssessmentScope,
    categories,
    blockers,
    evidenceCount: records.length,
    reviewEligible,
    reasonCode: reviewEligible
      ? "external-evidence-verification-still-required"
      : "production-readiness-evidence-incomplete-misclassified-or-failed",
    metadataOnly: true,
    evidenceClassificationRequired: true,
    evidenceAuthenticityVerified: false,
    externalEvidenceVerifierIntegrated: false,
    independentValidationVerified: false,
    productionReady: false,
    biometricClaimReady: false,
  });

  return Object.freeze({ ...body, inventoryDigest: sha(body) });
}

export function createTrustFaceProductionReadinessReviewInventory(input = {}) {
  rejectSensitive(input);
  return build(input);
}

export function assertTrustFaceProductionReadinessReviewInventory({ inventory, evidenceRecords } = {}) {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    fail("readiness_inventory_required", "inventory is required");
  }
  rejectSensitive(inventory);
  const rebuilt = build({ evidenceRecords, evaluatedAt: inventory.evaluatedAt });
  if (stable(inventory) !== stable(rebuilt)) {
    fail("readiness_inventory_tampered", "inventory mismatch");
  }
  return Object.freeze({
    valid: true,
    reviewEligible: rebuilt.reviewEligible,
    blockerCount: rebuilt.blockers.length,
    inventoryDigest: rebuilt.inventoryDigest,
    productionReady: false,
    independentValidationVerified: false,
  });
}
