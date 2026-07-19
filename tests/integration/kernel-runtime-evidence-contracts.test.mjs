import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const namespaceRoot = path.join(
  repositoryRoot,
  "node_modules",
  "@apidevelopers",
);
mkdirSync(namespaceRoot, { recursive: true });

for (const packageName of ["contracts", "kernel-evidence"]) {
  const linkPath = path.join(namespaceRoot, packageName);
  if (!existsSync(linkPath)) {
    symlinkSync(
      path.join(repositoryRoot, "packages", packageName),
      linkPath,
      "dir",
    );
  }
}

const {
  createRuntimeEvidenceHandoff,
  createTenantContext,
} = await import("@apidevelopers/contracts");
const {
  createEvidenceRegistry,
  verifyEvidence,
} = await import("@apidevelopers/kernel-evidence");
const {
  recordGovernedRuntimeEvidence,
} = await import("@apidevelopers/kernel-evidence/governed");

const tenantContext = createTenantContext({
  tenantId: "tenant_demo_0001",
  principalId: "principal.operator",
  requestId: "request.pipeline.evidence.0001",
  roles: ["operator"],
  permissions: ["read:evidence"],
  createdAt: "2026-07-19T06:10:00.000Z",
});

const runtimeReport = {
  reportId: "runtime.0001",
  planId: "plan.0001",
  decisionId: "decision.0001",
  proposalId: "proposal.0001",
  tenantId: "tenant_demo_0001",
  cycleId: "cycle.0001",
  sourceHandoffId: "handoff.policy.runtime.0001",
  policyDecisionId: "policy.0001",
  approvalId: null,
  requestedMode: "preview",
  dryRun: true,
  state: "previewed",
  startedAt: "2026-07-19T06:11:00.000Z",
  endedAt: "2026-07-19T06:11:01.000Z",
  executionAuthorized: false,
  executionObserved: false,
  mutationObserved: false,
  steps: [{
    stepId: "step.0001",
    action: "echo",
    status: "previewed",
    risk: "R1",
    output: { planned: true },
  }],
  evidence: [{
    evidenceId: "runtime-step.0001",
    stepId: "step.0001",
    status: "previewed",
  }],
  constraints: {
    policyGateRequired: true,
    explicitConfirmationRequired: true,
    automaticExecutionAllowed: false,
    tenantIsolationRequired: true,
    evidenceRequired: true,
  },
};

test("records runtime output as immutable verified evidence", () => {
  const handoff = createRuntimeEvidenceHandoff({
    handoffId: "handoff.runtime.evidence.0001",
    cycleId: "cycle.0001",
    tenantContext,
    runtimeReport,
    createdAt: "2026-07-19T06:12:00.000Z",
  });
  const registry = createEvidenceRegistry({
    clock: () => "2026-07-19T06:13:00.000Z",
  });

  const record = recordGovernedRuntimeEvidence({
    handoff,
    registry,
    evidenceId: "evidence.runtime.0001",
  });

  assert.equal(record.tenantId, tenantContext.tenantId);
  assert.equal(record.correlationId, runtimeReport.cycleId);
  assert.equal(record.source.reportId, runtimeReport.reportId);
  assert.equal(
    record.source.policyDecisionId,
    runtimeReport.policyDecisionId,
  );
  assert.equal(record.payload.runtimeReport.state, "previewed");
  assert.equal(record.metadata.immutable, true);
  assert.equal(record.metadata.redacted, true);
  assert.equal(verifyEvidence(record), true);
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.payload.runtimeReport));

  const stored = registry.get(record.evidenceId, {
    tenantId: tenantContext.tenantId,
  });
  assert.equal(verifyEvidence(stored), true);
  assert.equal(
    registry.get(record.evidenceId, { tenantId: "tenant_other_0001" }),
    null,
  );

  const tampered = structuredClone(record);
  tampered.payload.runtimeReport.state = "executed";
  assert.equal(verifyEvidence(tampered), false);

  assert.throws(
    () => recordGovernedRuntimeEvidence({
      handoff,
      registry,
      evidenceId: "evidence.runtime.0001",
    }),
    /duplicate evidenceId/,
  );
});
