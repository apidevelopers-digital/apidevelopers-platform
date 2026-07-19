
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const namespaceRoot = path.join(repositoryRoot, "node_modules", "@apidevelopers");
mkdirSync(namespaceRoot, { recursive: true });

for (const packageName of ["contracts", "kernel-governance"]) {
  const linkPath = path.join(namespaceRoot, packageName);
  if (!existsSync(linkPath)) {
    symlinkSync(path.join(repositoryRoot, "packages", packageName), linkPath, "dir");
  }
}

const {
  assertGovernedGovernanceReportContract,
  createEvolutionGovernanceHandoff,
  createTenantContext,
} = await import("@apidevelopers/contracts");
const { createGovernanceEngine } = await import("@apidevelopers/kernel-governance");
const { runGovernedGovernance } = await import("@apidevelopers/kernel-governance/governed");

function auditReport() {
  return {
    auditId: "audit.0001",
    generatedAt: "2026-07-19T09:10:00.000Z",
    requestedBy: "principal.auditor",
    scope: "lifecycle",
    tenantId: "tenant_demo_0001",
    cycleId: "cycle.0001",
    sourceHandoffId: "handoff.evidence.audit.0001",
    sourceEvidenceId: "evidence.runtime.0001",
    sourceEvidenceDigest: "c".repeat(64),
    evidenceVerified: true,
    mode: "advisory",
    status: "compliant",
    mutationAllowed: false,
    executionAllowed: false,
    subject: { decisionId: "decision.0001" },
    checks: [{ ruleId: "AUD-001", state: "pass" }],
    summary: { total: 1, pass: 1, warn: 0, fail: 0, unknown: 0 },
    evidence: ["evidence.runtime.0001"],
    constraints: {
      automaticApprovalAllowed: false,
      automaticExecutionAllowed: false,
      humanAuthorityRequired: true,
      traceabilityRequired: true,
      evidenceIntegrityRequired: true,
      tenantIsolationRequired: true,
      crossTenantAccessAllowed: false,
    },
  };
}

function evolutionReport() {
  return {
    evolutionId: "evolution.0001",
    generatedAt: "2026-07-19T09:11:00.000Z",
    requestedBy: "principal.auditor",
    scope: "lifecycle",
    tenantId: "tenant_demo_0001",
    cycleId: "cycle.0001",
    sourceHandoffId: "handoff.audit.evolution.0001",
    sourceAuditId: "audit.0001",
    sourceAuditStatus: "compliant",
    sourceEvidenceId: "evidence.runtime.0001",
    sourceEvidenceDigest: "c".repeat(64),
    auditVerified: true,
    mode: "advisory",
    status: "stable",
    proposals: [],
    summary: { total: 0, high: 0, medium: 0, low: 0 },
    humanReviewRequired: true,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
    automaticEvolutionAllowed: false,
    promotionAllowed: false,
    constraints: {
      mutationAllowed: false,
      executionAllowed: false,
      automaticApprovalAllowed: false,
      humanApprovalRequired: true,
      evidenceRequiredBeforePromotion: true,
      humanReviewRequired: true,
      tenantIsolationRequired: true,
      automaticEvolutionAllowed: false,
      promotionAllowed: false,
      crossTenantAccessAllowed: false,
    },
  };
}

test("turns a technically authorized governance engine result into a human-only review", () => {
  const tenantContext = createTenantContext({
    tenantId: "tenant_demo_0001",
    principalId: "principal.governance",
    requestId: "request.pipeline.governance.0001",
    roles: ["governance-reviewer"],
    permissions: ["read:evolution", "review:governance"],
    createdAt: "2026-07-19T09:12:00.000Z",
  });

  const audit = auditReport();
  const evolution = evolutionReport();
  const lifecycle = {
    decisionId: "decision.0001",
    proposalId: "proposal.0001",
    constitutionDecision: {
      constitutionDecisionId: "constitution.0001",
      tenantId: tenantContext.tenantId,
      decisionId: "decision.0001",
      effect: "allow",
    },
    policyDecision: {
      policyDecisionId: "policy.0001",
      tenantId: tenantContext.tenantId,
      decisionId: "decision.0001",
      effect: "allow",
    },
    approval: {
      approvalId: "approval.0001",
      approvedBy: "human.operator",
      tenantId: tenantContext.tenantId,
      decisionId: "decision.0001",
      proposalId: "proposal.0001",
      status: "approved",
      consumedAt: null,
      used: false,
      replayed: false,
    },
    auditReport: audit,
  };

  const handoff = createEvolutionGovernanceHandoff({
    handoffId: "handoff.evolution.governance.0001",
    cycleId: evolution.cycleId,
    tenantContext,
    evolutionReport: evolution,
    lifecycle,
    createdAt: "2026-07-19T09:13:00.000Z",
  });

  const report = runGovernedGovernance({
    handoff,
    engine: createGovernanceEngine({
      clock: () => "2026-07-19T09:14:00.000Z",
    }),
  });

  assert.equal(assertGovernedGovernanceReportContract(report), report);
  assert.equal(report.engineStatus, "authorized");
  assert.equal(report.engineAuthorized, true);
  assert.equal(report.status, "ready-for-human-decision");
  assert.equal(report.authorized, false);
  assert.equal(report.humanDecisionRequired, true);
  assert.equal(report.mutationAllowed, false);
  assert.equal(report.approvalAllowed, false);
  assert.equal(report.executionAllowed, false);
  assert.equal(report.automaticGovernanceAllowed, false);
  assert.equal(report.promotionAllowed, false);
  assert.deepEqual(report.summary, { total: 5, pass: 5, review: 0, fail: 0, unknown: 0 });
  assert.equal(report.sourceEvolutionId, evolution.evolutionId);
  assert.equal(report.sourceEvidenceDigest, evolution.sourceEvidenceDigest);
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.checks));
});
