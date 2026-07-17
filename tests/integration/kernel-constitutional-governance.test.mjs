import test from "node:test";
import assert from "node:assert/strict";

import { createConstitutionEngine } from "../../packages/kernel-constitution/src/index.mjs";
import { createPolicyEngine, hashExecutionPlan } from "../../packages/kernel-policy/src/index.mjs";
import { createAuditEngine } from "../../packages/kernel-audit/src/index.mjs";
import { createEvolutionEngine } from "../../packages/kernel-evolution/src/index.mjs";
import { createGovernanceEngine } from "../../packages/kernel-governance/src/index.mjs";

const NOW = "2026-07-17T05:00:00.000Z";
const clock = () => NOW;

function governedFixtures() {
  const tenantId = "tenant_wave5";
  const decision = {
    decisionId: "decision.wave5.001",
    selectedProposalId: "proposal.wave5.001",
    decisionState: "ready-for-human-decision",
    humanApprovalRequired: true,
    approved: false,
    mutationAllowed: false,
    executionAllowed: false,
    gates: { constitutionalConflict: false },
    constraints: {
      automaticDecisionAllowed: false,
      automaticApprovalAllowed: false,
      automaticExecutionAllowed: false,
    },
  };

  const plan = {
    planId: "plan.wave5.001",
    decisionId: decision.decisionId,
    proposalId: decision.selectedProposalId,
    steps: [{ stepId: "step.wave5.001", action: "publish" }],
  };

  const approval = {
    approvalId: "approval.wave5.001",
    status: "approved",
    approvedBy: "milena",
    tenantId,
    action: "publish",
    decisionId: decision.decisionId,
    proposalId: plan.proposalId,
    planHash: hashExecutionPlan(plan),
    expiresAt: "2026-07-18T05:00:00.000Z",
  };

  const action = {
    name: "publish",
    domain: "platform",
    risk: "R2",
    tags: ["release"],
    authority: ["operator"],
    evidence: ["evidence.wave5.001"],
    approvalPresent: true,
    backupPresent: true,
    rollbackPresent: true,
    input: {},
  };

  const constitution = {
    constitutionId: "constitution.global",
    version: "1.0.0",
    status: "active",
    tenantScope: ["*"],
    defaultEffect: "deny",
    rules: [{
      ruleId: "CON-WAVE5-001",
      effect: "require",
      match: { actions: ["publish"] },
      requirements: {
        authority: ["operator"],
        evidence: true,
        approval: true,
        backup: true,
        rollback: true,
      },
    }],
  };

  const runtimeReport = {
    reportId: "runtime.wave5.001",
    decisionId: decision.decisionId,
    planId: plan.planId,
    proposalId: plan.proposalId,
    dryRun: false,
    state: "executed",
    steps: [{ stepId: "step.wave5.001", status: "executed" }],
  };

  const evidence = [{
    evidenceId: "evidence.wave5.001",
    status: "active",
    integrityValid: true,
  }];

  return { tenantId, decision, plan, approval, action, constitution, runtimeReport, evidence };
}

function runGovernedLifecycle({ denyConstitution = false } = {}) {
  const data = governedFixtures();

  if (denyConstitution) {
    data.constitution.rules.unshift({
      ruleId: "CON-WAVE5-000",
      effect: "deny",
      match: { anyTags: ["release"] },
      statement: "Release denied for this test.",
    });
  }

  const constitutionDecision = createConstitutionEngine({ clock }).evaluate({
    tenantId: data.tenantId,
    decisionId: data.decision.decisionId,
    proposalId: data.plan.proposalId,
    action: data.action,
    constitution: data.constitution,
  });

  const policyDecision = createPolicyEngine({ clock }).evaluate({
    tenantId: data.tenantId,
    action: data.action,
    decision: data.decision,
    plan: data.plan,
    dryRun: false,
    approval: data.approval,
  });

  const auditReport = createAuditEngine({
    clock,
    verifyEvidence: () => true,
  }).audit({
    tenantId: data.tenantId,
    decision: data.decision,
    plan: data.plan,
    policyDecision,
    approval: data.approval,
    runtimeReport: data.runtimeReport,
    evidence: data.evidence,
  });

  const evolutionReport = createEvolutionEngine({ clock }).propose(auditReport);

  const governanceReport = createGovernanceEngine({ clock }).evaluate({
    tenantId: data.tenantId,
    decisionId: data.decision.decisionId,
    proposalId: data.plan.proposalId,
    constitutionDecision,
    policyDecision,
    approval: data.approval,
    auditReport,
    evolutionReport,
  });

  return { ...data, constitutionDecision, policyDecision, auditReport, evolutionReport, governanceReport };
}

test("constitution -> policy -> audit -> evolution -> governance authorizes a coherent lifecycle without executing", () => {
  const result = runGovernedLifecycle();

  assert.equal(result.constitutionDecision.effect, "allow");
  assert.equal(result.constitutionDecision.executionAllowed, false);

  assert.equal(result.policyDecision.effect, "allow");
  assert.equal(result.policyDecision.executionAllowed, true);
  assert.equal(result.policyDecision.planHash, hashExecutionPlan(result.plan));

  assert.equal(result.auditReport.status, "compliant");
  assert.deepEqual(result.auditReport.summary, {
    total: 5,
    pass: 5,
    warn: 0,
    fail: 0,
    unknown: 0,
  });

  assert.equal(result.evolutionReport.status, "stable");
  assert.deepEqual(result.evolutionReport.proposals, []);

  assert.equal(result.governanceReport.status, "authorized");
  assert.equal(result.governanceReport.authorized, true);
  assert.equal(result.governanceReport.mutationAllowed, false);
  assert.equal(result.governanceReport.executionAllowed, false);
  assert.equal(result.governanceReport.constraints.executionGatewayRequired, true);

  assert.equal(result.governanceReport.references.constitutionDecisionId, result.constitutionDecision.constitutionDecisionId);
  assert.equal(result.governanceReport.references.policyDecisionId, result.policyDecision.policyDecisionId);
  assert.equal(result.governanceReport.references.approvalId, result.approval.approvalId);
  assert.equal(result.governanceReport.references.auditId, result.auditReport.auditId);
  assert.equal(result.governanceReport.references.evolutionId, result.evolutionReport.evolutionId);
});

test("constitutional deny prevails and governance blocks promotion", () => {
  const result = runGovernedLifecycle({ denyConstitution: true });

  assert.equal(result.constitutionDecision.effect, "deny");
  assert.equal(result.policyDecision.effect, "allow");
  assert.equal(result.auditReport.status, "compliant");
  assert.equal(result.evolutionReport.status, "stable");

  assert.equal(result.governanceReport.status, "blocked");
  assert.equal(result.governanceReport.authorized, false);
  assert.equal(
    result.governanceReport.checks.find((item) => item.ruleId === "GOV-001").state,
    "fail",
  );
  assert.equal(result.governanceReport.executionAllowed, false);
});
