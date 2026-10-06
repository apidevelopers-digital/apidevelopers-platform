const STRING_FIELDS = [
  "id",
  "title",
  "author",
  "source",
  "publisher",
  "url_or_reference",
  "domain",
  "subdomain",
  "topic",
  "material_type",
  "language",
  "license_status",
  "usage_allowed",
  "access_level",
  "quality_level",
  "recency_level",
  "sensitive_data_risk",
  "copyright_risk",
  "summary",
  "curator",
  "intake_date",
  "reviewer",
  "review_status",
  "storage_status",
  "notes",
];

export const KNOWLEDGE_INTAKE_REQUIRED_FIELDS = Object.freeze([
  ...STRING_FIELDS,
  "year",
  "tags",
]);

export const KNOWLEDGE_LICENSE_STATUSES = Object.freeze([
  "public_domain",
  "open_access",
  "licensed_internal_use",
  "subscription_read_only",
  "restricted",
  "unknown",
  "blocked",
]);

export const KNOWLEDGE_USAGE_MODES = Object.freeze([
  "metadata_only",
  "reference_only",
  "summary_allowed",
  "partial_excerpt_allowed",
  "fulltext_internal_allowed",
  "fulltext_blocked",
]);

export const REAL_INGESTION_ENABLED = false;

const RAW_CONTENT_KEYS = Object.freeze([
  "content",
  "bytes",
  "buffer",
  "data",
  "raw",
  "file_bytes",
  "fileBytes",
]);

const FULLTEXT_LICENSES = new Set([
  "public_domain",
  "open_access",
  "licensed_internal_use",
]);

const REFERENCE_ONLY_LICENSES = new Set([
  "subscription_read_only",
  "restricted",
  "unknown",
  "blocked",
]);

const HIGH_RISK_VALUES = new Set(["high", "blocked", "critical"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))].slice(0, 100);
}

function normalizeMetadata(metadata = {}) {
  const out = {};
  for (const field of STRING_FIELDS) out[field] = text(metadata[field]);
  out.year = metadata.year ?? "";
  out.tags = normalizeTags(metadata.tags);
  return out;
}

function missingRequired(metadata) {
  return KNOWLEDGE_INTAKE_REQUIRED_FIELDS.filter((field) => {
    if (field === "tags") return !metadata.tags.length;
    if (field === "year") return metadata.year === "" || metadata.year === null || metadata.year === undefined;
    return !text(metadata[field]);
  });
}

function normalizeArtifact(artifact = {}) {
  const sha256 = text(artifact.sha256).toLowerCase();
  const byteSize = Number(artifact.byteSize ?? artifact.byte_size ?? 0);
  return {
    filename: text(artifact.filename),
    mime_type: text(artifact.mime_type ?? artifact.mimeType),
    sha256,
    byte_size: Number.isFinite(byteSize) && byteSize > 0 ? Math.floor(byteSize) : 0,
  };
}

function artifactErrors(artifact) {
  const errors = [];
  if (!artifact.filename) errors.push("artifact_filename_required");
  if (!artifact.mime_type) errors.push("artifact_mime_type_required");
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) errors.push("artifact_sha256_required");
  if (!artifact.byte_size) errors.push("artifact_byte_size_required");
  return errors;
}

function rawContentKeys(input = {}) {
  return RAW_CONTENT_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(input, key));
}

function resolveAllowedUse(metadata, requestedUse) {
  const declaredUse = text(metadata.usage_allowed);
  const requested = text(requestedUse || declaredUse || "reference_only");
  if (!KNOWLEDGE_USAGE_MODES.includes(declaredUse)) {
    return { ok: false, reason: "invalid_usage_allowed", effectiveUse: "reference_only" };
  }
  if (!KNOWLEDGE_USAGE_MODES.includes(requested)) {
    return { ok: false, reason: "invalid_requested_use", effectiveUse: "reference_only" };
  }

  const license = metadata.license_status;
  if (!KNOWLEDGE_LICENSE_STATUSES.includes(license)) {
    return { ok: false, reason: "invalid_license_status", effectiveUse: "reference_only" };
  }

  if (REFERENCE_ONLY_LICENSES.has(license)) {
    const safe = declaredUse === "metadata_only" ? "metadata_only" : "reference_only";
    if (requested !== "metadata_only" && requested !== "reference_only") {
      return { ok: false, reason: "license_blocks_requested_use", effectiveUse: safe };
    }
    return { ok: license !== "blocked", reason: license === "blocked" ? "license_blocked" : null, effectiveUse: safe };
  }

  if (requested === "fulltext_internal_allowed" && !FULLTEXT_LICENSES.has(license)) {
    return { ok: false, reason: "fulltext_requires_clear_license", effectiveUse: "reference_only" };
  }

  if (declaredUse === "fulltext_blocked" && requested === "fulltext_internal_allowed") {
    return { ok: false, reason: "declared_usage_blocks_fulltext", effectiveUse: "reference_only" };
  }

  return { ok: true, reason: null, effectiveUse: requested };
}

export function createKnowledgeIntakePlan(input = {}) {
  const metadata = normalizeMetadata(input.metadata);
  const artifact = normalizeArtifact(input.artifact);
  const reasons = [];
  const rejectedRawKeys = [
    ...rawContentKeys(input),
    ...rawContentKeys(input.artifact),
  ];

  if (rejectedRawKeys.length) reasons.push("raw_content_not_accepted_by_intake_planner");

  const missing = missingRequired(metadata);
  if (missing.length) reasons.push(`metadata_missing:${missing.join(",")}`);

  const artifactProblems = artifactErrors(artifact);
  reasons.push(...artifactProblems);

  if (!KNOWLEDGE_LICENSE_STATUSES.includes(metadata.license_status)) {
    reasons.push("invalid_license_status");
  }

  const use = resolveAllowedUse(metadata, input.requested_use);
  if (!use.ok && use.reason) reasons.push(use.reason);

  if (HIGH_RISK_VALUES.has(metadata.sensitive_data_risk.toLowerCase())) {
    reasons.push("sensitive_data_review_block");
  }

  if (
    HIGH_RISK_VALUES.has(metadata.copyright_risk.toLowerCase()) &&
    use.effectiveUse === "fulltext_internal_allowed"
  ) {
    reasons.push("copyright_risk_blocks_fulltext");
  }

  const uniqueReasons = [...new Set(reasons)];
  const blocked = uniqueReasons.length > 0;

  return {
    ok: !blocked,
    gate: blocked ? "blocked" : "human_review_required",
    real_ingestion_enabled: REAL_INGESTION_ENABLED,
    content_write_authorized: false,
    metadata,
    artifact,
    requested_use: text(input.requested_use || metadata.usage_allowed || "reference_only"),
    effective_use: use.effectiveUse,
    reasons: uniqueReasons,
    storage_plan* {
      mode: "dry_run_only",
      raw_content_database_write: false,
      content_write: false,
      primary_role: "mac_storage_primary",
      replica_role: "mac_storage_replica",
      ai_work_processing: true,
    },
    retrieval_plan: {
      kernel: "@apidevelopers/kernel-retrieval",
      tenant_isolation_required: true,
      provenance_required: true,
      domain: metadata.domain || null,
      subdomain: metadata.subdomain || null,
      source_id: metadata.id || null,
      artifact_sha256: artifact.sha256 || null,
    },
    evidence_plan: {
      kernel: "@apidevelopers/kernel-evidence",
      sha256_required: true,
      curator_required: true,
      reviewer_required: true,
      decision_required_before_storage: true,
    },
  };
}
