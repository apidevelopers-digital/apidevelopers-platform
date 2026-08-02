import crypto from "node:crypto";
import path from "node:path";

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const REQUIRED_FILES = Object.freeze([
  "README.md",
  "index.html",
  "package-lock.json",
  "package.json",
  "publishing-manifest.json",
  "src/App.jsx",
  "src/main.jsx",
  "src/styles.css",
  "test/smoke.test.mjs",
]);

const FORBIDDEN_SEGMENTS = Object.freeze([
  ".git",
  ".next",
  "build",
  "dist",
  "node_modules",
]);

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${field}`);
  }
  return value.trim();
}

function normalizeArchivePath(value) {
  const raw = requireString(value, "archiveFile");
  if (raw.includes("\\") || raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) {
    throw new Error(`unsafe_archive_path:${raw}`);
  }

  const normalized = path.posix.normalize(raw.replace(/^\.\//, ""));
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`unsafe_archive_path:${raw}`);
  }

  return normalized.replace(/\/+$/, "");
}

function assertAllowedPath(file) {
  const segments = file.split("/");
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.includes(segment))) {
    throw new Error(`forbidden_archive_path:${file}`);
  }

  if (
    segments.some(
      (segment) =>
        segment === ".env" ||
        segment.startsWith(".env.") ||
        segment.endsWith(".pem") ||
        segment.endsWith(".key") ||
        segment === "id_rsa" ||
        segment === "id_ed25519",
    )
  ) {
    throw new Error(`forbidden_archive_path:${file}`);
  }
}

function normalizeFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("missing_or_invalid:archiveFiles");
  }

  const normalized = [...new Set(files.map(normalizeArchivePath))].sort();
  for (const file of normalized) {
    assertAllowedPath(file);
  }

  for (const required of REQUIRED_FILES) {
    if (!normalized.includes(required)) {
      throw new Error(`missing_archive_file:${required}`);
    }
  }

  return normalized;
}

function assertSha(value, field) {
  const sha = requireString(value, field).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`invalid_${field}`);
  }
  return sha;
}

function assertSha256(value, field) {
  const sha = requireString(value, field).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) {
    throw new Error(`invalid_${field}`);
  }
  return sha;
}

function assertRunId(value) {
  const runId = requireString(String(value ?? ""), "sourceRunId");
  if (!/^[0-9]+$/.test(runId)) {
    throw new Error("invalid_source_run_id");
  }
  return runId;
}

function assertArchiveBytes(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("invalid_archive_bytes");
  }
  if (value > MAX_ARCHIVE_BYTES) {
    throw new Error("archive_exceeds_50mb_limit");
  }
  return value;
}

export function createHostingerNodeArchivePlan({
  sourceRepository,
  sourceSha,
  sourceRunId,
  archiveName,
  archiveSha256,
  archiveBytes,
  archiveFiles,
  targetDomain,
  generatedAt = new Date().toISOString(),
}) {
  const repository = requireString(sourceRepository, "sourceRepository");
  const sha = assertSha(sourceSha, "source_sha");
  const runId = assertRunId(sourceRunId);
  const domain = requireString(targetDomain, "targetDomain").toLowerCase();
  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)
  ) {
    throw new Error("invalid_target_domain");
  }

  const name = requireString(archiveName, "archiveName");
  const expectedName = `site-factory-hostinger-node-source-${sha}.zip`;
  if (name !== expectedName) {
    throw new Error("archive_name_sha_mismatch");
  }

  const files = normalizeFiles(archiveFiles);
  const bytes = assertArchiveBytes(archiveBytes);
  const checksum = assertSha256(archiveSha256, "archive_sha256");
  const timestamp = requireString(generatedAt, "generatedAt");

  const plan = {
    schemaVersion: "1.0",
    kind: "site-factory-hostinger-node-archive-plan",
    mode: "dry-run",
    readyForApply: false,
    approvalRequired: true,
    writesEnabled: false,
    deployEnabled: false,
    dnsEnabled: false,
    hostingerWriteExecuted: false,
    source: {
      repository,
      sha,
      workflowRunId: runId,
    },
    target: {
      domain,
      runtime: "react-vite",
      nodeVersion: "22",
      buildCommand: "npm run build",
      outputDirectory: "dist",
      healthcheck: "/",
    },
    archive: {
      name,
      format: "zip",
      sha256: checksum,
      bytes,
      maximumBytes: MAX_ARCHIVE_BYTES,
      files,
      excludes: [
        ".env*",
        ".git/",
        ".next/",
        "build/",
        "dist/",
        "node_modules/",
        "*.key",
        "*.pem",
      ],
    },
    futureApiContract: {
      method: "POST",
      endpoint:
        "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive",
      requestPrepared: false,
      buildStarted: false,
      buildUuid: null,
    },
    checks: {
      sourceShaPinned: true,
      archiveNamePinnedToSha: true,
      packageManifestPresent: true,
      lockfilePresent: true,
      forbiddenPathsAbsent: true,
      belowHostingerArchiveLimit: true,
      remoteWriteBlocked: true,
    },
    generatedAt: timestamp,
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

export {
  FORBIDDEN_SEGMENTS,
  MAX_ARCHIVE_BYTES,
  REQUIRED_FILES,
};
