import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const namespaceRoot = path.join(repositoryRoot, "node_modules", "@apidevelopers");
mkdirSync(namespaceRoot, { recursive: true });

for (const packageName of ["contracts", "kernel-evidence", "kernel-audit"]) {
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
  assertGovernedAuditReportContract,
  createEvidenceAuditHandoff,
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
const {
  runGovernedAudit,
} = await import("@apidevelopers/kernel-audit/governed");

function lifecycle(tenantId) {
  const decision = {
    decisionId: "decision.0001",
    selectedProposalId: "proposal.0001",
    decisionState: "ready-for-human-decision",
    humanApprovalRequired: true,
    approved: false,
    mutationAllowed: false,
    executionAllowed: false,
    constraints: {
      automaticDecisionAllowed: false,
      automaticApprovalAllowed: false,
      automaticExecutionAllowed: false,
    },
  };
  const plan = {
    planId: "plan.0001",
    decisionId: decision.decisionId,
    proposalId: decision.selectedProposalId,
    planHash: "planhash.0001",
    steps: [{ stepId: "step.0001", action: "echo" }],
  };
  const policyDecision = {
    policyDecisionId: "policy.0001",
    effect: "allow",
    executionAllowed: true,
    mutationAllowed: true,
    planHash: plan.planHash,
  };
  const approval = {
    approvalId: "approval.0001",
    status: "approved",
    approvedBy: "human.operator",
    tenantId,
    decisionId: decision.decisionId,
    proposalId: plan.proposalId,
    planHash: plan.planHash,
    consumedAt: null,
    used: false,
  };
  return { decision, plan, policyDecision, approval };
}

function runtimeReport(tenantId, lifecycleData) {
  return {
    reportId: "runtime.0001",
    planId: lifecycleData.plan.planId,
    decisionId: lifecycleData.decision.decisionId,
    proposalId: lifecycleData.plan.proposalId,
    tenantId,
    cycleId: "cycle.0001",
    sourceHandoffId: "handoff.policy.runtime.0001",
    policyDecisionId: lifecycleData.policyDecision.policyDecisionId,
    approvalId: lifecycleData.approval.approvalId,
    requestedMode: "execute",
    dryRun: false,
    state: "executed",
    startedAt: "2026-07-19T07:11:00.000Z",
    endedAt: "2026-07-19T07:11:01.000Z",
    executionAuthorized: true,
    executionObserved: true,
    mutationObserved: true,
    steps: [{
      stepId: "step.0001",
      action: "echo",
      status: "executed",
      risk: "R1",
      output: { value: 1 },
    }],
    evidence: [{
      evidenceId: "runtime-step.0001",
      stepId: "step.0001",
      status: "executed",
    }],
    constraints: {
      policyGateRequired: true,
      explicitConfirmationRequired: true,
      automaticExecutionAllowed: false,
      tenantIsolationRequired: true,
      evidenceRequired: true,
    },
  };
}

test("audits a verified evidence artifact through public governed boundaries", () => {
  const tenantContext = createTenantContext({
    tenantId: "tenant_demo_0001",
    principalId: "principal.auditor",
    requestId: "request.pipeline.audit.0001",
    roles: ["auditor"],
    permissions: ["read:evidence", "read:audit"],
    createdAt: "2026-07-19T07:10:00.000Z",
  });
  const lifecycleData = lifecycle(tenantContext.tenantId);
  const runtime = runtimeReport(tenantContext.tenantId, lifecycleData);

  const runtimeEvidenceHandoff = createRuntimeEvidenceHandoff({
    handoffId: "handoff.runtime.evidence.0001",
    cycleId: runtime.cycleId,
    tenantContext,
    runtimeReport: runtime,
    createdAt: "2026-07-19T07:12:00.000Z",
  });
  const registry = createEvidenceRegistry({
    clock: () => "2026-07-19T07:13:00.000Z",
  });
  const evidenceRecord = recordGovernedRuntimeEvidence({
    handoff: runtimeEvidenceHandoff,
    registry,
    evidenceId: "evidence.runtime.0001",
  });

  assert.equal(verifyEvidence(evidenceRecord), true);

  const evidenceAuditHandoff = createEvidenceAuditHandoff({
    handoffId: "handoff.evidence.audit.0001",
    cycleId: runtime.cycleId,
    tenantContext,
    evidenceRecord,
    lifecycle: lifecycleData,
    createdAt: "2026-07-19T07:14:00.000Z",
  });

  const report = runGovernedAudit({
    handoff: evidenceAuditHandoff,
    requestedBy: tenantContext.principalId,
  });

  assert.equal(assertGovernedAuditReportContract(report), report);
  assert.equal(report.status, "compliant");
  assert.deepEqual(report.summary, {
    total: 5,
    pass: 5,
    warn: 0,
    fail: 0,
    unknown: 0,
  });
  assert.equal(report.sourceEvidenceId, evidenceRecord.evidenceId);
  assert.equal(report.sourceEvidenceDigest, evidenceRecord.integrity.digest);
  assert.equal(report.evidenceVerified, true);
  assert.equal(report.mutationAllowed, false);
  assert.equal(report.executionAllowed, false);
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.checks));

  const tampered = structuredClone(evidenceRecord);
  tampered.payload.runtimeReport.steps[0].output.value = 2;
  const tamperedHandoff = createEvidenceAuditHandoff({
    handoffId: "handoff.evidence.audit.tampered",
    cycleId: runtime.cycleId,
    tenantContext,
    evidenceRecord: tampered,
    lifecycle: lifecycleData,
  });
  assert.throws(
    () => runGovernedAudit({ handoff: tamperedHandoff }),
    /integrity verification failed/,
  );

  const foreignTenant = createTenantContext({
    tenantId: "tenant_other_0001",
    principalId: "principal.auditor",
    requestId: "request.pipeline.audit.0002",
    createdAt: "2026-07-19T07:15:00.000Z",
  });
  assert.throws(
    () => createEvidenceAuditHandoff({
      handoffId: "handoff.evidence.audit.cross-tenant",
      cycleId: runtime.cycleId,
      tenantContext: foreignTenant,
      evidenceRecord,
      lifecycle: lifecycleData,
    }),
    /tenantId mismatch/,
  );
});
