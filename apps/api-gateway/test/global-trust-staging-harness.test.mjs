import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createGlobalTrustNullProvider } from "../src/global-trust-null-provider.mjs";
import {
  createGlobalTrustStagingHarness,
  validateGlobalTrustStagingManifest,
} from "../src/global-trust-staging-harness.mjs";

async function loadManifest() {
  const content = await readFile(
    new URL("../staging/global-trust-staging-manifest.json", import.meta.url),
    "utf8",
  );
  return JSON.parse(content);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createPassingAdapter(events = []) {
  return {
    async assertEnvironment({ manifest, nullProvider }) {
      events.push("assert-environment");
      assert.equal(manifest.mode, "dry-run");
      assert.equal(manifest.network.egress, "blocked");
      assert.equal(nullProvider.status().contactEnabled, false);
    },

    async seed({ manifest }) {
      events.push(`seed:${manifest.tenantId}`);
      return { seeded: true };
    },

    async executeScenario({ scenario, sourceSha }) {
      events.push(`scenario:${scenario.id}`);
      if (scenario.id === "STG-16") {
        const error = new Error("synthetic dependency failure");
        error.code = "DEPENDENCY_UNAVAILABLE";
        throw error;
      }
      return {
        actualResult: scenario.expectedResult,
        evidenceRefs: [
          `scenario:${scenario.id}`,
          `sha:${sourceSha.slice(0, 12)}`,
        ],
      };
    },

    async verifyIntegrity() {
      events.push("verify-integrity");
      return {
        valid: true,
        proofCount: 18,
        protectedRecordCount: 18,
      };
    },

    async cleanup({ manifest }) {
      events.push(`cleanup:${manifest.tenantId}`);
      return {
        cleaned: true,
        residualResources: 0,
      };
    },
  };
}

test("runs STG-01 through STG-18 in fail-closed dry-run mode", async () => {
  const manifest = await loadManifest();
  const events = [];
  const timestamps = [
    "2026-07-28T23:30:00.000Z",
    "2026-07-28T23:30:01.000Z",
  ];
  const harness = createGlobalTrustStagingHarness({
    manifest,
    adapter: createPassingAdapter(events),
    runIdFactory: () => "staging_run_001",
    now: () => timestamps.shift(),
  });

  const report = await harness.run({
    sourceSha: "7200f8bb71548153b95195765445ab5c4c8ff60a",
  });

  assert.equal(report.status, "passed");
  assert.equal(report.scenarioCount, 18);
  assert.equal(report.passedScenarioCount, 18);
  assert.deepEqual(
    report.scenarios.map(({ scenarioId }) => scenarioId),
    Array.from(
      { length: 18 },
      (_, index) => `STG-${String(index + 1).padStart(2, "0")}`,
    ),
  );
  assert.equal(
    report.scenarios.find(({ scenarioId }) => scenarioId === "STG-16").errorCode,
    "DEPENDENCY_UNAVAILABLE",
  );
  assert.equal(report.integrity.valid, true);
  assert.deepEqual(report.cleanup, {
    cleaned: true,
    residualResources: 0,
  });
  assert.equal(report.inferenceExecuted, false);
  assert.equal(report.modelExecuted, false);
  assert.equal(report.toolExecuted, false);
  assert.equal(report.providerContacted, false);
  assert.equal(report.automaticRemediationExecuted, false);
  assert.equal(report.egressEnabled, false);
  assert.equal(report.sensitiveContentIncluded, false);
  assert.equal(events.at(-1), "cleanup:tenant_staging_global_trust_001");

  const directory = await mkdtemp(join(tmpdir(), "staging-harness-report-"));
  try {
    const reportPath = join(directory, "report.json");
    await writeFile(reportPath, JSON.stringify(report), "utf8");
    const persisted = await readFile(reportPath, "utf8");
    for (const forbidden of [
      "synthetic-secret-value",
      "raw-prompt-content",
      "raw-tool-arguments",
    ]) {
      assert.equal(persisted.includes(forbidden), false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manifest validation rejects unsafe staging configuration", async () => {
  const manifest = await loadManifest();

  const realProvider = clone(manifest);
  realProvider.provider.type = "external";
  assert.throws(
    () => validateGlobalTrustStagingManifest(realProvider),
    /provider.type must be null/,
  );

  const egress = clone(manifest);
  egress.network.egress = "allowed";
  assert.throws(
    () => validateGlobalTrustStagingManifest(egress),
    /network.egress must be blocked/,
  );

  const productionTenant = clone(manifest);
  productionTenant.tenantId = "tenant_production_001";
  assert.throws(
    () => validateGlobalTrustStagingManifest(productionTenant),
    /synthetic staging tenant/,
  );

  const incompleteMatrix = clone(manifest);
  incompleteMatrix.scenarios.pop();
  assert.throws(
    () => validateGlobalTrustStagingManifest(incompleteMatrix),
    /STG-01 through STG-18/,
  );

  const enabledExecution = clone(manifest);
  enabledExecution.execution.toolExecutionEnabled = true;
  assert.throws(
    () => validateGlobalTrustStagingManifest(enabledExecution),
    /toolExecutionEnabled must be false/,
  );
});

test("null provider blocks inference and tool execution", () => {
  const provider = createGlobalTrustNullProvider();

  assert.equal(provider.status().contactEnabled, false);
  assert.throws(
    () => provider.infer({ prompt: "synthetic" }),
    (error) => error.code === "NULL_PROVIDER_EXECUTION_BLOCKED",
  );
  assert.throws(
    () => provider.invokeTool({ toolId: "synthetic.tool" }),
    (error) => error.code === "NULL_PROVIDER_EXECUTION_BLOCKED",
  );
});

test("cleanup runs when seeding fails and the report remains failed", async () => {
  const manifest = await loadManifest();
  let cleanupCalls = 0;
  const adapter = createPassingAdapter();
  adapter.seed = async () => {
    const error = new Error("seed failed");
    error.code = "SEED_FAILED";
    throw error;
  };
  adapter.cleanup = async () => {
    cleanupCalls += 1;
    return { cleaned: true, residualResources: 0 };
  };

  const timestamps = [
    "2026-07-28T23:40:00.000Z",
    "2026-07-28T23:40:01.000Z",
  ];
  const harness = createGlobalTrustStagingHarness({
    manifest,
    adapter,
    runIdFactory: () => "staging_run_seed_failure",
    now: () => timestamps.shift(),
  });
  const report = await harness.run({ sourceSha: "abc123" });

  assert.equal(report.status, "failed");
  assert.equal(report.fatalErrorCode, "SEED_FAILED");
  assert.equal(report.scenarioCount, 0);
  assert.equal(cleanupCalls, 1);
  assert.equal(report.cleanup.cleaned, true);
});

test("repeated dry-runs produce the same logical scenario vector", async () => {
  const manifest = await loadManifest();

  async function execute(runId) {
    const timestamps = [
      "2026-07-28T23:50:00.000Z",
      "2026-07-28T23:50:01.000Z",
    ];
    const harness = createGlobalTrustStagingHarness({
      manifest,
      adapter: createPassingAdapter(),
      runIdFactory: () => runId,
      now: () => timestamps.shift(),
    });
    return harness.run({ sourceSha: "deterministic-sha" });
  }

  const left = await execute("run_left");
  const right = await execute("run_right");

  assert.deepEqual(
    left.scenarios.map(({ scenarioId, actualResult, passed }) => ({
      scenarioId,
      actualResult,
      passed,
    })),
    right.scenarios.map(({ scenarioId, actualResult, passed }) => ({
      scenarioId,
      actualResult,
      passed,
    })),
  );
});
