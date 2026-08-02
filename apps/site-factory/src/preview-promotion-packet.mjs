import crypto from "node:crypto";

const REQUIRED_ARTIFACT_FILES = Object.freeze([
  "dist/index.html",
  "publishing-manifest.json",
  "reference-build-evidence.json",
]);

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${field}`);
  }
  return value.trim();
}

function requireFalse(value, field) {
  if (value !== false) {
    throw new Error(`unsafe_flag:${field}`);
  }
}

function normalizeFiles(files) {
  if (!Array.isArray(files)) {
    throw new Error("missing_or_invalid:artifactFiles");
  }

  const normalized = [...new Set(files.map((value) => requireString(value, "artifactFiles")))].sort();
  for (const required of REQUIRED_ARTIFACT_FILES) {
    if (!normalized.includes(required)) {
      throw new Error(`missing_artifact_file:${required}`);
    }
  }

  return normalized;
}

export function createPreviewPromotionPacket({
  plan,
  sourceRepository,
  sourceSha,
  sourceRunId,
  artifactName,
  artifactFiles,
  generatedAt = new Date().toISOString(),
}) {
  if (!plan || typeof plan !== "object") {
    throw new Error("missing_or_invalid:plan");
  }

  if (plan.mode !== "dry-run") {
    throw new Error("unsafe_plan_mode");
  }
  requireFalse(plan.readyForApply, "readyForApply");
  requireFalse(plan.writesEnabled, "writesEnabled");
  requireFalse(plan.deployEnabled, "deployEnabled");
  requireFalse(plan.dnsEnabled, "dnsEnabled");

  const repository = requireString(sourceRepository, "sourceRepository");
  const sha = requireString(sourceSha, "sourceSha").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error("invalid_source_sha");
  }

  const runId = requireString(String(sourceRunId ?? ""), "sourceRunId");
  if (!/^[0-9]+$/.test(runId)) {
    throw new Error("invalid_source_run_id");
  }

  const artifact = requireString(artifactName, "artifactName");
  const expectedArtifactName = `site-factory-reference-${sha}`;
  if (artifact !== expectedArtifactName) {
    throw new Error("artifact_name_sha_mismatch");
  }

  const files = normalizeFiles(artifactFiles);
  const generated = requireString(generatedAt, "generatedAt");

  const packet = {
    schemaVersion: "1.0",
    kind: "site-factory-preview-promotion-packet",
    mode: "dry-run",
    readyForApply: false,
    writesEnabled: false,
    deployEnabled: false,
    dnsEnabled: false,
    approvalRequired: true,
    source: {
      repository,
      sha,
      workflowRunId: runId,
      artifactName: artifact,
      requiredFiles: files,
    },
    target: {
      environment: plan.target?.environment,
      domain: plan.target?.domain,
      healthcheck: plan.target?.healthcheck,
    },
    checks: {
      sourceShaPinned: true,
      workflowRunPinned: true,
      artifactNamePinnedToSha: true,
      requiredFilesVerified: true,
      deploymentBlocked: true,
      dnsBlocked: true,
    },
    promotionPlanFingerprint: requireString(
      plan.fingerprint,
      "promotionPlanFingerprint",
    ),
    generatedAt: generated,
  };

  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(packet))
    .digest("hex");

  return Object.freeze({
    ...packet,
    fingerprint,
  });
}

export { REQUIRED_ARTIFACT_FILES };
