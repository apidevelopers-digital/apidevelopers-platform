import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { currentOpenApiFixture } from "./fixtures/hostinger-node-build-openapi.mjs";

const monitorScript = fileURLToPath(new URL("../src/run-hostinger-node-contract-monitor.mjs", import.meta.url));

test("monitor reports closed issue and new archive contract without releasing review gate", () => {
  const dir = mkdtempSync(join(tmpdir(), "site-factory-monitor-signals-"));
  try {
    const openapi = currentOpenApiFixture();
    openapi.info.version = "2.4.3";
    const openapiPath = join(dir, "openapi.json");
    const issuePath = join(dir, "issue.json");
    const outputPath = join(dir, "report.json");
    writeFileSync(openapiPath, JSON.stringify(openapi));
    writeFileSync(issuePath, JSON.stringify({ number: 56, state: "closed" }));
    const result = spawnSync(process.execPath, [
      monitorScript, "--openapi", openapiPath, "--issue", issuePath, "--output", outputPath
    ], { encoding: "utf8", env: { ...process.env, MONITOR_OBSERVED_AT: "2026-10-27T00:00:00Z" } });
    assert.equal(result.status, 2, result.stderr);
    const summary = JSON.parse(result.stdout);
    const report = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(summary.reviewRequired, true);
    assert.deepEqual(summary.checks, {
      currentBuildOperationPresent: true,
      legacyBuildOperationPresent: false
    });
    assert.deepEqual(summary.changeSignals, {
      legacyEndpointMissing: true,
      currentArchiveFlowDocumented: true,
      contractChanged: true,
      apiVersionChanged: true,
      issueChanged: true,
      officialIssueClosed: true
    });
    for (const [key, value] of Object.entries(summary.changeSignals)) {
      assert.equal(value, report.changeSignals[key]);
    }
    assert.deepEqual(summary.barriers, {
      writesEnabled: false,
      remoteBuildStarted: false,
      productionExecutionAllowed: false
    });
    assert.equal(Object.hasOwn(summary, "observed"), false);
    assert.equal(Object.hasOwn(summary, "expected"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
