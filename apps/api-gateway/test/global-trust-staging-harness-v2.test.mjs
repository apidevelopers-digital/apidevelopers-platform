import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createGlobalTrustNullProvider } from "../src/global-trust-null-provider.mjs";
import { createGlobalTrustStagingControlAdapter } from "../src/global-trust-staging-control-adapter.mjs";
import { sanitizeGlobalTrustStagingReport } from "../src/global-trust-staging-evidence.mjs";
import { createGlobalTrustStagingHarnessV2 } from "../src/global-trust-staging-harness-v2.mjs";
import { createGlobalTrustStagingNetworkGuard } from "../src/global-trust-staging-network-guard.mjs";
import {
  createGlobalTrustStagingTelemetry,
  deriveGlobalTrustStagingExecutionFlags,
} from "../src/global-trust-staging-telemetry.mjs";

const SOURCE_SHA = "e630a654e572e0508a3c46c269c023891795768e";

const RESULT_BY_ID = Object.freeze({
  "STG-01": "allow",
  "STG-02": "deny",
  "STG-03": "deny",
  "STG-04": "deny",
  "STG-05": "deny",
  "STG-06": "deny",
  "STG-07": "deny",
  "STG-08": "review",
  "STG-09": "deny",
  "STG-10": "deny",
  "STG-11": "deny",
  "STG-12": "allow_no_execution",
  "STG-13": "deny",
  "STG-14": "invalid_integrity",
  "STG-15": "isolated",
  "STG-16": "fail_closed",
  "STG-17": "deterministic",
  "STG-18": "cleanup_ready",
});

const BINDING_METADATA = Object.freeze({
  baseline: ["GlobalTrustOperationalComposition", "inspect"],
  "tenant-boundary": ["TenantContext", "validate"],
  authorization: ["GlobalTrustAuthorizationDecision", "authorize"],
  "model-registry": ["GlobalTrustModelRegistryEvent", "lookup"],
  "use-case-registry": ["GlobalTrustUseCaseRegistryEvent", "lookup"],
  "data-policy-registry": ["GlobalTrustDataPolicyRegistryEvent", "lookup"],
  "admission-gate": ["GlobalTrustAdmissionDecision", "evaluate"],
  "human-review": ["GlobalTrustHumanApprovalDecision", "evaluate"],
  "prompt-defense": ["GlobalTrustPromptDefenseDecision", "evaluate"],
  "output-validator": ["GlobalTrustOutputValidationDecision", "evaluate"],
  "tool-guard": ["GlobalTrustToolInvocationDecision", "evaluate"],
  "kill-switch": ["GlobalTrustKillSwitchState", "getTenant"],
  integrity: ["GlobalTrustIntegrityVerification", "verify"],
  "tenant-isolation": ["GlobalTrustTenantIsolationVerification", "verify"],
  "fail-closed": ["GlobalTrustFailClosedVerification", "execute"],
  determinism: ["GlobalTrustDeterminismVerification", "verify"],
  cleanup: ["GlobalTrustCleanupVerification", "verify"],
});

async function loadManifest() {
  return JSON.parse(
    await readFile(
      new URL("../staging/global-trust-staging-manifest.json", import.meta.url),
      "utf8",
    ),
  );
}

function makeBindings({ mutate } = {}) {
  return Object.fromEntries(
    Object.entries(BINDING_METADATA).map(([action, [contractType, operation]]) => [
      action,
      {
        contractType,
        operation,
        async execute(context) {
          assert.equal(Object.hasOwn(context, "expectedResult"), false);
          assert.equal(typeof context.scenarioId, "string");
          if (action === "fail-closed") {
            const error = new Error("synthetic dependency failure");
            error.code = "DEPENDENCY_UNAVAILABLE";
            throw error;
          }
          const result = {
            actualResult: RESULT_BY_ID[context.scenarioId],
            evidenceRefs: [`control:${context.scenarioId}`],
            controlProof: {
              contractType,
              operation,
              recordId: `record:${context.scenarioId}`,
            },
          };
          return mutate ? mutate({ action, context, result }) ?? result : result;
        },
      },
    ]),
  );
}

function makeAdapter(options = {}) {
  return createGlobalTrustStagingControlAdapter({
    bindings: makeBindings(options),
    assertEnvironment: async ({ manifest, networkGuard, nullProvider }) => {
      assert.equal(manifest.tenantId, "tenant_staging_global_trust_001");
      assert.equal(networkGuard.installed, true);
      assert.equal(nullProvider.status().contactEnabled, false);
      return { safe: true };
    },
    seed: async () => ({ seeded: true }),
    verifyIntegrity: async () => ({
      valid: true,
      proofCount: 18,
      protectedRecordCount: 18,
    }),
    cleanup: async () => ({ cleaned: true, residualResources: 0 }),
  });
}

function makeClock() {
  const values = [
    "2026-07-29T01:10:00.000Z",
    "2026-07-29T01:10:01.000Z",
  ];
  return () => values.shift();
}

async function runHarness({ adapter = makeAdapter(), telemetryFactory } = {}) {
  const harness = createGlobalTrustStagingHarnessV2({
    manifest: await loadManifest(),
    adapter,
    telemetryFactory,
    runIdFactory: () => "staging_run_001",
    now: makeClock(),
  });
  return harness.run({ sourceSha: SOURCE_SHA });
}

test("runs STG-01 through STG-18 without exposing expected results to bindings", async () => {
  const report = await runHarness();

  assert.equal(report.contractVersion, "2.0");
  assert.equal(report.status, "passed");
  assert.equal(report.fatalErrorCode, null);
  assert.equal(report.sourceSha, SOURCE_SHA);
  assert.equal(report.scenarioCount, 18);
  assert.equal(report.passedScenarioCount, 18);
  assert.deepEqual(
    report.scenarios.map(({ scenarioId }) => scenarioId),
    Array.from({ length: 18 }, (_, index) => `STG-${String(index + 1).padStart(2, "0")}`),
  );
  assert.equal(report.scenarios.find(({ scenarioId }) => scenarioId === "STG-16").errorCode, "DEPENDENCY_UNAVAILABLE");
  assert.equal(report.networkGuard.installedDuringExecution, true);
  assert.equal(report.networkGuard.mode, "deny-all");
  assert.deepEqual(report.executionFlags, {
    inferenceExecuted: false,
    modelExecuted: false,
    toolExecuted: false,
    providerContacted: false,
    automaticRemediationExecuted: false,
    egressEnabled: false,
    sensitiveContentIncluded: false,
  });
  assert.equal(report.telemetry.networkSuccessfulCount, 0);
  assert.equal(JSON.stringify(report).includes("synthetic dependency failure"), false);
});

test("applies a deny-all process network guard and records blocked attempts", async () => {
  const telemetry = createGlobalTrustStagingTelemetry();
  const guard = createGlobalTrustStagingNetworkGuard({ telemetry });

  guard.install();
  try {
    await assert.rejects(
      globalThis.fetch("https://example.invalid/"),
      (error) => error.code === "STAGING_EGRESS_BLOCKED",
    );
  } finally {
    guard.uninstall();
  }

  const snapshot = telemetry.snapshot();
  assert.equal(snapshot.networkAttemptCount, 1);
  assert.equal(snapshot.networkBlockedCount, 1);
  assert.equal(snapshot.networkSuccessfulCount, 0);
  assert.equal(guard.installed, false);
});

test("derives non-zero execution flags from telemetry and fails the run", async () => {
  const telemetry = createGlobalTrustStagingTelemetry();
  telemetry.recordProviderContact({ operation: "synthetic_probe" });

  const report = await runHarness({ telemetryFactory: () => telemetry });

  assert.equal(report.status, "failed");
  assert.equal(report.fatalErrorCode, "ZERO_EXECUTION_INVARIANT_VIOLATED");
  assert.equal(report.executionFlags.providerContacted, true);
  assert.equal(
    deriveGlobalTrustStagingExecutionFlags(telemetry.snapshot()).providerContacted,
    true,
  );
});

test("fails closed when a binding returns an invalid control proof", async () => {
  const adapter = makeAdapter({
    mutate({ context, result }) {
      if (context.scenarioId === "STG-01") {
        return {
          ...result,
          controlProof: {
            contractType: "UnexpectedContract",
            operation: "inspect",
            recordId: "record:STG-01",
          },
        };
      }
      return result;
    },
  });

  const report = await runHarness({ adapter });

  assert.equal(report.status, "failed");
  assert.equal(report.scenarios[0].actualResult, "fail_closed");
  assert.equal(report.scenarios[0].passed, false);
  assert.equal(report.scenarios[0].errorCode, "STAGING_HARNESS_ERROR");
});

test("sanitizer uses an allow-list and rejects malformed evidence references", async () => {
  const report = await runHarness();
  const input = {
    ...report,
    rawPrompt: "must-not-survive",
    api_key: "must-not-survive",
    accessToken: "must-not-survive",
  };
  const sanitized = sanitizeGlobalTrustStagingReport(input);
  const serialized = JSON.stringify(sanitized);

  assert.equal(serialized.includes("must-not-survive"), false);
  assert.equal(Object.hasOwn(sanitized, "rawPrompt"), false);
  assert.equal(Object.hasOwn(sanitized, "api_key"), false);

  const malformed = {
    ...report,
    scenarios: report.scenarios.map((scenario, index) => (
      index === 0
        ? { ...scenario, evidenceRefs: ["not a canonical ref"] }
        : scenario
    )),
  };
  assert.throws(
    () => sanitizeGlobalTrustStagingReport(malformed),
    /evidenceRefs\[0\] has an invalid format/,
  );
});

test("requires the exact tenant and a full lowercase source SHA", async () => {
  const manifest = await loadManifest();
  assert.throws(
    () => createGlobalTrustStagingHarnessV2({
      manifest: { ...manifest, tenantId: "tenant_staging_other" },
      adapter: makeAdapter(),
    }),
    /manifest\.tenantId must be tenant_staging_global_trust_001/,
  );

  const harness = createGlobalTrustStagingHarnessV2({
    manifest,
    adapter: makeAdapter(),
  });
  await assert.rejects(
    harness.run({ sourceSha: "abc123" }),
    /sourceSha must be a full lowercase SHA-1/,
  );
});

test("null provider blocks inference and tool execution", () => {
  const provider = createGlobalTrustNullProvider();
  assert.equal(provider.status().contactEnabled, false);
  assert.throws(
    () => provider.infer(),
    (error) => error.code === "NULL_PROVIDER_EXECUTION_BLOCKED",
  );
  assert.throws(
    () => provider.invokeTool(),
    (error) => error.code === "NULL_PROVIDER_EXECUTION_BLOCKED",
  );
});
