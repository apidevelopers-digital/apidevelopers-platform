import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { hashCanonical } from "../../packages/architecture-rule-engine/src/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts", "architecture-report-check.mjs");

function run(args, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function validReport() {
  const integrity = {
    algorithm: "sha256",
    input: hashCanonical({ source: "test" }),
    ruleset: hashCanonical({ rulesetId: "architecture-core" }),
    exceptions: hashCanonical([]),
    findings: hashCanonical([]),
  };

  const report = {
    schemaVersion: "1.0.0",
    reportId: "arch-report-test",
    generatedAt: "2026-07-21T00:00:00.000Z",
    summary: {
      result: "COMPLIANT",
      findingCount: 0,
      blockingFindingCount: 0,
    },
    findings: [],
    integrity,
  };

  report.integrity.report = hashCanonical(report);
  return report;
}

test("report check exposes help without reading a file", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Architecture Validation Report Check/);
  assert.equal(result.stderr, "");
});

test("report check accepts a canonical report and writes GitHub metadata", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "architecture-report-check-"));
  const reportPath = path.join(directory, "report.json");
  const outputPath = path.join(directory, "github-output.txt");
  const summaryPath = path.join(directory, "step-summary.md");
  await writeFile(reportPath, `${JSON.stringify(validReport(), null, 2)}\n`);

  const result = run([reportPath], {
    GITHUB_OUTPUT: outputPath,
    GITHUB_STEP_SUMMARY: summaryPath,
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /"result": "COMPLIANT"/);
  assert.equal(result.stderr, "");
});

test("report check rejects malformed JSON", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "architecture-report-check-"));
  const reportPath = path.join(directory, "report.json");
  await writeFile(reportPath, "{not-json");

  const result = run([reportPath]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /REPORT_JSON_INVALID/);
});

test("report check rejects a report with invalid integrity", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "architecture-report-check-"));
  const reportPath = path.join(directory, "report.json");
  const report = validReport();
  report.integrity.report = "sha256:".padEnd(71, "0");
  await writeFile(reportPath, `${JSON.stringify(report)}\n`);

  const result = run([reportPath]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /REPORT_INTEGRITY_INVALID/);
});
