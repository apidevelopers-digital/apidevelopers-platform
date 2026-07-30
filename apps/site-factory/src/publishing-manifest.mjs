const REQUIRED_STRING_FIELDS = [
  "schemaVersion",
  "app",
  "domain",
  "runtime",
  "branch",
  "hosting",
  "healthcheck",
  "approvalPolicy",
];

const SUPPORTED_RUNTIMES = new Set([
  "static",
  "react-vite",
  "node-express",
  "api",
  "portal",
]);

const SUPPORTED_HOSTING = new Set(["hostinger"]);
const SUPPORTED_APPROVAL_POLICIES = new Set(["explicit-igor-approval"]);

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validatePublishingManifest(manifest) {
  const errors = [];
  const warnings = [];

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      ok: false,
      errors: ["manifest_must_be_an_object"],
      warnings,
    };
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!nonEmptyString(manifest[field])) {
      errors.push(`missing_or_invalid:${field}`);
    }
  }

  if (manifest.schemaVersion !== "1.0") {
    errors.push("unsupported_schema_version");
  }

  if (nonEmptyString(manifest.runtime) && !SUPPORTED_RUNTIMES.has(manifest.runtime)) {
    errors.push("unsupported_runtime");
  }

  if (nonEmptyString(manifest.hosting) && !SUPPORTED_HOSTING.has(manifest.hosting)) {
    errors.push("unsupported_hosting");
  }

  if (
    nonEmptyString(manifest.approvalPolicy) &&
    !SUPPORTED_APPROVAL_POLICIES.has(manifest.approvalPolicy)
  ) {
    errors.push("unsupported_approval_policy");
  }

  if (nonEmptyString(manifest.domain) && !manifest.domain.includes(".")) {
    errors.push("invalid_domain");
  }

  if (
    nonEmptyString(manifest.healthcheck) &&
    !manifest.healthcheck.startsWith("/")
  ) {
    errors.push("healthcheck_must_start_with_slash");
  }

  if (["static", "react-vite"].includes(manifest.runtime)) {
    if (!nonEmptyString(manifest.build)) {
      errors.push("build_required_for_frontend");
    }
    if (!nonEmptyString(manifest.output)) {
      errors.push("output_required_for_frontend");
    }
  }

  if (["node-express", "api", "portal"].includes(manifest.runtime)) {
    if (!nonEmptyString(manifest.entry)) {
      errors.push("entry_required_for_node_runtime");
    }
    if (!nonEmptyString(manifest.nodeVersion)) {
      errors.push("node_version_required");
    }
  }

  if (!manifest.preview || typeof manifest.preview !== "object") {
    errors.push("preview_configuration_required");
  } else {
    if (manifest.preview.required !== true) {
      errors.push("preview_must_be_required");
    }
    if (!nonEmptyString(manifest.preview.domainPattern)) {
      errors.push("preview_domain_pattern_required");
    }
  }

  if (!manifest.release || typeof manifest.release !== "object") {
    errors.push("release_configuration_required");
  } else {
    if (manifest.release.byCommit !== true) {
      errors.push("release_by_commit_required");
    }
    if (manifest.release.rollbackByCommit !== true) {
      errors.push("rollback_by_commit_required");
    }
  }

  if (
    !Array.isArray(manifest.requiredChecks) ||
    manifest.requiredChecks.length === 0
  ) {
    errors.push("required_checks_must_not_be_empty");
  }

  if (
    Array.isArray(manifest.requiredSecrets) &&
    manifest.requiredSecrets.length > 0
  ) {
    warnings.push("manifest_declares_runtime_secrets");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized:
      errors.length === 0
        ? {
            ...manifest,
            app: manifest.app.trim(),
            domain: manifest.domain.trim().toLowerCase(),
            branch: manifest.branch.trim(),
            healthcheck: manifest.healthcheck.trim(),
          }
        : undefined,
  };
}

export function assertPublishingManifest(manifest) {
  const result = validatePublishingManifest(manifest);

  if (!result.ok) {
    const error = new Error(
      `invalid_publishing_manifest:${result.errors.join(",")}`,
    );
    error.code = "INVALID_PUBLISHING_MANIFEST";
    error.details = result;
    throw error;
  }

  return result.normalized;
}
