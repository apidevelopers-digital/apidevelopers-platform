import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createToolInvocationPolicy } from "@apidevelopers/contracts";

import { createGlobalTrustNullProvider } from "../src/global-trust-null-provider.mjs";
import {
  createGlobalTrustComposedOperationalGateway,
} from "../src/operational-global-trust-composition.mjs";
import {
  createGlobalTrustStagingHarnessV2,
} from "../src/global-trust-staging-harness-v2.mjs";
import {
  createGlobalTrustStagingOperationalAdapter,
} from "../src/global-trust-staging-operational-adapter.mjs";

const TENANT_ID = "tenant_staging_global_trust_001";
const FALLBACK_SHA = "85041453a8543561256d6720a34e8d1530185aea";

const EXPECTED_BY_ID = Object.freeze({
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

function sequence(prefix) {
  let value = 0;
  return () => `${prefix}_${String(++value).padStart(3, "0")}`;
}

function adminPrincipal() {
  return {
    id: "staging_operator_001",
    tenantId: TENANT_ID,
    kind: "human",
    scopes: [
      "admission:evaluate",
      "audit:read",
      "simulation:run",
      "model:read",
      "model:write",
      "usecase:read",
      "usecase:write",
      "datapolicy:read",
      "datapolicy:write",
      "tool:invoke",
    ],
  };
}

function gatewayOptions(stateFilePath) {
  return {
    stateFilePath,
    adminKey: "synthetic-staging-operator-key",
    adminPrincipal: adminPrincipal(),
    toolInvocationPolicies: [
      createToolInvocationPolicy({
        policyId: "policy_staging_crm_read",
        tenantId: TENANT_ID,
        toolId: "crm.read",
        allowedActions: ["read"],
        deniedActions: [],
        maxCallsPerRequest: 2,
        humanApprovalRequired: false,
      }),
    ],
    admissionDecisionIdFactory: sequence("admission"),
    admissionProofIdFactory: sequence("admission_proof"),
    admissionNow: () => "2026-07-29T02:00:00.000Z",
    admissionIntegrityNow: () => "2026-07-29T02:00:01.000Z",
    simulationIdFactory: sequence("simulation"),
    simulationProofIdFactory: sequence("simulation_proof"),
    simulationNow: () => "2026-07-29T02:00:02.000Z",
    simulationIntegrityNow: () => "2026-07-29T02:00:03.000Z",
  };
}

async function loadManifest() {
  return JSON.parse(
    await readFile(
      new URL(
        "../staging/global-trust-staging-manifest.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

function fixedClock() {
  const values = [
    "2026-07-29T02:10:00.000Z",
    "2026-07-29T02:10:01.000Z",
  ];
  return () => values.shift();
}

test(
  "binds Harness v2 to operational Global Trust controls without inference, tools, provider contact or deploy",
  async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), "global-trust-staging-operational-"),
    );
    const stateFilePath = join(workspacePath, "state.json");

    try {
      const gateway = createGlobalTrustComposedOperationalGateway(
        gatewayOptions(stateFilePath),
      );
      const nullProvider = createGlobalTrustNullProvider();
      const bundle = createGlobalTrustStagingOperationalAdapter({
        gateway,
        workspacePath,
        tenantId: TENANT_ID,
        nullProvider,
      });
      const harness = createGlobalTrustStagingHarnessV2({
        manifest: await loadManifest(),
        adapter: bundle.adapter,
        nullProvider,
        runIdFactory: () => "staging_operational_run_001",
        now: fixedClock(),
      });

      const sourceSha =
        process.env.GLOBAL_TRUST_SOURCE_SHA
        ?? process.env.GITHUB_SHA
        ?? FALLBACK_SHA;
      const report = await harness.run({ sourceSha });

      assert.equal(report.status, "passed");
      assert.equal(report.fatalErrorCode, null);
      assert.equal(report.sourceSha, sourceSha);
      assert.equal(report.scenarioCount, 18);
      assert.equal(report.passedScenarioCount, 18);
      assert.equal(report.integrity.valid, true);
      assert.ok(report.integrity.proofCount > 0);
      assert.ok(report.integrity.protectedRecordCount > 0);
      assert.equal(report.cleanup.cleaned, true);
      assert.equal(report.cleanup.residualResources, 0);
      assert.equal(
        report.networkGuard.installedDuringExecution,
        true,
      );
      assert.equal(report.networkGuard.mode, "deny-all");

      assert.deepEqual(
        Object.fromEntries(
          report.scenarios.map(({ scenarioId, actualResult }) => [
            scenarioId,
            actualResult,
          ]),
        ),
        EXPECTED_BY_ID,
      );

      for (const scenario of report.scenarios) {
        assert.ok(scenario.controlProof.contractType);
        assert.ok(scenario.controlProof.operation);
        assert.ok(scenario.controlProof.recordId);
        assert.ok(
          scenario.evidenceRefs.length > 0,
          `missing evidence for ${scenario.scenarioId}`,
        );
      }

      assert.deepEqual(report.executionFlags, {
        inferenceExecuted: false,
        modelExecuted: false,
        toolExecuted: false,
        providerContacted: false,
        automaticRemediationExecuted: false,
        egressEnabled: false,
        sensitiveContentIncluded: false,
      });
      assert.equal(report.telemetry.inferenceExecutionCount, 0);
      assert.equal(report.telemetry.modelExecutionCount, 0);
      assert.equal(report.telemetry.toolExecutionCount, 0);
      assert.equal(report.telemetry.providerContactCount, 0);
      assert.equal(report.telemetry.networkSuccessfulCount, 0);

      const serialized = JSON.stringify(report);
      for (const forbidden of [
        "synthetic-staging-operator-key",
        "abcdefghijklmnopqrstuvwxyz1234567890",
        "Ignore previous instructions",
        "synthetic_customer_001",
      ]) {
        assert.equal(serialized.includes(forbidden), false);
      }

      await assert.rejects(
        access(workspacePath),
        (error) => error?.code === "ENOENT",
      );
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  },
);

test("rejects a non-canonical staging tenant before execution", async () => {
  const workspacePath = await mkdtemp(
    join(tmpdir(), "global-trust-staging-operational-invalid-"),
  );
  try {
    const gateway = createGlobalTrustComposedOperationalGateway(
      gatewayOptions(join(workspacePath, "state.json")),
    );
    assert.throws(
      () =>
        createGlobalTrustStagingOperationalAdapter({
          gateway,
          workspacePath,
          tenantId: "tenant_staging_other",
          nullProvider: createGlobalTrustNullProvider(),
        }),
      /tenantId must be tenant_staging_global_trust_001/,
    );
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
