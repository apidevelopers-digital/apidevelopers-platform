import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runHostingerNodeArchiveDryRun } from "./hostinger-node-tus-dry-run-flow.mjs";

// Offline only: input JSON + local ZIP -> sanitized simulation report. Never calls Hostinger.
const allowed = new Set(["openapi", "issue", "observedAt", "username", "domain", "archivePath",
  "startBuildInput", "chunkSize", "responses", "startOffset", "archiveSha256"]);
export function runOfflineTusPreview(args) {
  if (args.length !== 4 || args[0] !== "--input" || args[2] !== "--archive")
    throw new Error("invalid_arguments");
  const info = fs.statSync(args[3]);
  if (!info.isFile() || info.size < 4 || info.size > 50 * 1024 * 1024)
    throw new Error("invalid_archive_size");
  const inputInfo = fs.statSync(args[1]);
  if (!inputInfo.isFile() || inputInfo.size > 12 * 1024 * 1024)
    throw new Error("invalid_input_size");
  const input = JSON.parse(fs.readFileSync(args[1], "utf8"));
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !allowed.has(key))) throw new Error("invalid_input");
  const bytes = new Uint8Array(fs.readFileSync(args[3]));
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4)
    throw new Error("invalid_zip_signature");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (input.archiveSha256 !== undefined && input.archiveSha256 !== sha256)
    throw new Error("archive_sha256_mismatch");
  const { archiveSha256: _, ...parameters } = input;
  const report = runHostingerNodeArchiveDryRun({ ...parameters, bytes });
  const barriers = {
    writesEnabled: report.writesEnabled,
    buildStartAllowed: report.buildStartAllowed,
    remoteBuildStarted: report.remoteBuildStarted,
    productionExecutionAllowed: report.productionExecutionAllowed,
  };
  if (!report.transfer.complete || report.reviewRequired !== true ||
      Object.values(barriers).some((value) => value !== false))
    throw new Error("dry_run_gate_failed");
  return {
    mode: "dry-run", reviewRequired: true,
    archive: { relativePath: input.archivePath, bytes: bytes.length, sha256 },
    tus: { mode: "mock", complete: true, offset: report.transfer.offset,
      chunks: report.transfer.requests.length },
    buildArchivePath: report.plan.buildRequest.body.source_options.archive_path,
    barriers,
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    process.stdout.write(JSON.stringify(runOfflineTusPreview(process.argv.slice(2))) + "\n");
  } catch (error) {
    const code = error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
      ? error.message : "offline_preview_failed";
    process.stderr.write(JSON.stringify({ error: code }) + "\n");
    process.exitCode = 1;
  }
}
