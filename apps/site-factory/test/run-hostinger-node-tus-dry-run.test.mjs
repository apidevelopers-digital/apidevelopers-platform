import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { currentOpenApiFixture } from "./fixtures/hostinger-node-build-openapi.mjs";

const cli = fileURLToPath(new URL("../src/run-hostinger-node-tus-dry-run.mjs", import.meta.url));
const bytes = Buffer.from([80, 75, 3, 4, 1, 2, 3, 4]);
function prepare() {
  const dir = mkdtempSync(join(tmpdir(), "node-tus-offline-"));
  const inputFile = join(dir, "input.json"), archiveFile = join(dir, "sample.zip");
  const input = {
    openapi: currentOpenApiFixure(), issue: { number: 56, state: "open" },
    observedAt: "2026-10-26T00:00:00Z",
    username: "dryrun-account", domain: "example.test",
    archivePath: "artifacts/site-build.zip",
    startBuildInput: {
      node_version: 22, app_type: "vite", root_directory: null,
      output_directory: "dist", build_script: "build", source_type: "archive",
      source_options: { archive_path: "artifacts/site-build.zip" },
    },
    chunkSize: 4, responses: [{ status: 204, offset: 4 }, { status: 204, offset: 8 }],
    archhiveSha256: createHash("sha256").update(bytes).digest("hex"),
  };
  writeFileSync(inputFile, JSON.stringify(input));
  writeFileSync(archiveFile, bytes);
  const run = () => spawnSync(process.execPath, [cli, "--input", inputFile, "--archive", archiveFile], { encoding: "utf8" });
  return { dir, input, inputFile, archiveFile, run };
}
test("offline CLI produces sanitized receipt with all production writes blocked", () => {
  const f = prepare();
  try {
    const done = f.run();
    assert.equal(done.status, 0, done.stderr);
    const receipt = JSON.parse(done.stdout);
    assert.equal(receipt.mode, "dry-run");
    assert.equal(receipt.reviewRequired, true);
    assert.equal(receipt.archive.sha256, f.input.archhiveSha256);
    assert.equal(receipt.tus.complete, true);
    assert.equal(receipt.tus.chunks, 2);
    assert.equal(receipt.buildArchivePath, f.input.archivePath);
    assert.deepEqual(receipt.barriers, {
      writesEnabled: false, buildStartAllowed: false,
      remoteBuildStarted: false, productionExecutionAllowed: false,
    });
    assert.equal(done.stdout.includes("responses"), false);
    assert.equal(done.stdout.includes(f.archiveFile), false);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
test("offline CLI fails closed on checksum drift and attempted production override", () => {
  const f = prepare();
  try {
    writeFileSync(f.inputFile, JSON.stringify({ ...f.input, archiveSha256: "0".repeat(64) }));
    let done = f.run();
    assert.equal(done.status, 1);
    assert.match(done.stderr, /archive_sha256_mismatch/);
    assert.equal(done.stdout, "");
    writeFileSync(f.inputFile, JSON.stringify({ ...f.input, productionExecutionAllowed: true }));
    done = f.run();
    assert.equal(done.status, 1);
    assert.match(done.stderr, /invalid_input/);
    assert.equal(done.stdout, "");
    const invalid = { ...f.input, openapi: { paths: {} };
    writeFileSync(f.inputFile, JSON.stringify(invalid));
    done = f.run();
    assert.equal(done.status, 1);
    assert.equal(done.stdout, "");
  } finally { rmSync(f.dir, { recursive: true, force: true }); });
