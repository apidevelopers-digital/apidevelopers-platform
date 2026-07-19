import test from "node:test";
import assert from "node:assert/strict";
import { createPlanningEngine } from "../../packages/kernel-planning/src/index.mjs";
import { createDecisionEngine } from "../../packages/kernel-decision/src/index.mjs";
import { createRuntimeEngine } from "../../packages/kernel-runtime/src/index.mjs";
import {
  createEvidenceRegistry,
  verifyEvidence,
} from "../../packages/kernel-evidence/src/index.mjs";
import {
  createPolicyEngine,
  hashExecutionPlan,
} from "../../packages/kernel-policy/src/index.mjs";
import { createAuditEngine } from "../../packages/kernel-audit/src/index.mjs";
import { createGuard } from "../../services/guard/src/index.mjs";

const NOW = "2026-07-16T22:00:00.000Z";

function createGovernedFixture() {
  const clock = () => NOW;
  const reflection = {
    reflectionId: "reflection.integration.1",
    findings: [{
      ruleId: "INT-001",
      severity: "low",
      subject: "safe-echo",
      statement: "A governed echo action is available for preview.",
      recommendation: "Preview the action before any execution.",
      evidence: ["evidence:safe-echo"],
    }],
  };

  const planning = createPlanningEngine({ clock }).plan(reflection);
  const decision = createDecisionEngine({ clock }).evaluate(planning);
  assert.equal(decision.decisionState, "ready-for-human-decision");

  const plan = {
    planId: "plan.integration.1",
    decisionId: decision.decisionId,
    proposalId: decision.selectedProposalId,
    steps: [{
      stepId: "step.1",
      action: "echo",
      input: { message: "preview-only" },
    }],
  };

  let handlerCalls = 0;
  const runtime = createRuntimeEngine({
    clock,
    actions: {
      echo: {
        risk: "R1",
        reversible: true,
        handler: async () => {
          handlerCalls += 1;
          return { ok: true };
        },
      },
    },
  });
  const registry = createEvidenceRegistry({ clock });
  const guard = createGuard({
    policyEngine: createPolicyEngine({ clock }),
    runtime,
    evidenceRegistry: registry,
    clock,
  });

  return {
    clock,
    planning,
    decision,
    plan,
    registry,
    guard,
    handlerCalls: () => handlerCalls,
  };
}

test("planning -> decision -> policy -> runtime dry-run -> evidence", async () => {
  const fixture = createGovernedFixture();

  const report = await fixture.guard.run({
    tenantId: "tenant_integration",
    action: { name: "echo", risk: "R1" },
    decision: fixture.decision,
    plan: fixture.plan,
    correlationId: "corr.integration.1",
  });

  assert.equal(report.state, "previewed");
  assert.equal(report.policy.planHash, hashExecutionPlan(fixture.plan));
  assert.equal(fixture.handlerCalls(), 0);
  assert.equal(report.runtime.dryRun, true);

  const records = fixture.registry.list({ tenantId: "tenant_integration" });
  assert.equal(records.length, 1);
  assert.equal(records[0].type, "audit");
  assert.equal(verifyEvidence(records[0]), true);
});

test("planning -> decision -> policy -> approved runtime -> evidence -> audit", async () => {
  const fixture = createGovernedFixture();
  const approval = {
    approvalId: "approval.integration.1",
    status: "approved",
    approvedBy: "human.integration",
    tenantId: "tenant_integration",
    action: "echo",
    decisionId: fixture.decision.decisionId,
    proposalId: fixture.decision.selectedProposalId,
    planHash: hashExecutionPlan(fixture.plan),
    expiresAt: "2026-07-17T22:00:00.000Z",
  };

  const report = await fixture.guard.run({
    tenantId: "tenant_integration",
    action: { name: "echo", risk: "R1" },
    decision: fixture.decision,
    plan: fixture.plan,
    dryRun: false,
    approval,
    confirmation: "EXECUTE_APPROVED_PLAN",
    correlationId: "corr.integration.execute.1",
  });

  assert.equal(report.state, "executed");
  assert.equal(report.approvalConsumed, true);
  assert.equal(report.runtime.dryRun, false);
  assert.equal(fixture.handlerCalls(), 1);

  const records = fixture.registry.list({ tenantId: "tenant_integration" });
  assert.equal(records.length, 1);
  assert.equal(verifyEvidence(records[0]), true);

  const auditReport = createAuditEngine({
    clock: fixture.clock,
    verifyEvidence,
  }).audit({
    tenantId: "tenant_integration",
    decision: fixture.decision,
    plan: {
      ...fixture.plan,
      planHash: hashExecutionPlan(fixture.plann),
    },
    policyDecision: report.policy,
    approval,
    runtimeReport: report.runtime,
    evidence: records,
  }, {
    requestedBy: "integration-test",
    scope: "governed-execution",
  });

  assert.equal(auditReport.status, "compliant");
  assert.equal(auditReport.summary.fail, 0);
  assert.equal(auditReport.mutationAllowed, false);
  assert.equal(auditReport.executionAllowed, false);
});
