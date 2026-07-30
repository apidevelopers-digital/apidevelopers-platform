import crypto from "node:crypto";

import { assertPublishingManifest } from "./publishing-manifest.mjs";

export function createPreviewPromotionPlan({
  manifest,
  sourceRepository,
  sourceSha,
  artifactName,
  generatedAt = new Date().toISOString(),
}) {
  const normalized = assertPublishingManifest(manifest);

  for (const [field, value] of Object.entries({
    sourceRepository,
    sourceSha,
    artifactName,
  })) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`missing_or_invalid:${field}`);
    }
  }

  const previewDomain = normalized.preview?.domainPattern;
  if (!previewDomain) {
    throw new Error("preview_domain_missing");
  }

  const plan = {
    schemaVersion: "1.0",
    mode: "dry-run",
    readyForApply: false,
    writesEnabled: false,
    deployEnabled: false,
    dnsEnabled: false,
    approvalRequired: true,
    approvalPolicy: normalized.approvalPolicy,
    app: normalized.app,
    runtime: normalized.runtime,
    hosting: normalized.hosting,
    source: {
      repository: sourceRepository.trim(),
      sha: sourceSha.trim(),
      artifactName: artifactName.trim(),
    },
    target: {
      environment: "preview",
      domain: previewDomain,
      healthcheck: normalized.healthcheck,
    },
    checks: [...normalized.requiredChecks],
    generatedAt,
  };

  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(plan))
    .digest("hex");

  return Object.freeze({
    ...plan,
    fingerprint,
  });
}
