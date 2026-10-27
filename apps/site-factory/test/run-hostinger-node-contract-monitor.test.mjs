import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const monitorScript = fileURLToPath(new URL("../src/run-hostinger-node-contract-monitor.mjs", import.meta.url));

test("sanitized contract monitor summary retains all fail-closed production barriers", () => {
  const workspace = mkdtempSync(join(tmpdir(), "site-factory-node-monitor-"));
  try {
    const openapiPath = join(workspace, "openapi.json");
    const issuePath = join(workspace, "issue.json");
    const reportPath = join(workspace, "report.json");
    writeFileSync(openapiPath, JSON.stringify({ openapi: "3.0.0", info: { version: "2.3.0" }, paths: {} }));
    writeFileSync(issuePath, JSON.stringify({ number: 56, state: "open" }));

    const result = spawnSync(process.execPath, [
      monitorScript, "--openapi", openapiPath, "--issue", issuePath, "--output", reportPath
    ], { encoding: "utf8", env: { ...process.env, MONITOR_OBSERVED_AT: "2026-10-26T00:00:00Z" } });

    assert.equal(result.status, 2, result.stderr); // Expected review-required gate, not a successful build.
    const summary = JSON.parse(result.stdout);
    const savedReport = JSON.parse(readFileSync(reportPath, "utf8"));
    const expected = {
      writesEnabled: false,
      remoteBuildStarted: false,
      productionExecutionAllowed: false
    };
    assert.deepEqual(summary.barriers, expected);
    assert.equal(savedReport.barriers.productionExecutionAllowed, false);
    assert.equal(summary.reviewRequired, true);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
