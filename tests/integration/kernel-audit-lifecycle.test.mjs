import test from "node:test";
import assert from "node:assert/strict";

import { createPlanningEngine } from "../../packages/kernel-planning/src/index.mjs";
import { createDecisionEngine } from "../../packages/kernel-decision/src/index.mjs";
import {
  createPolicyEngine,
  hashExecutionPlan,
} from "../../packages/kernel-policy/src/index.mjs";
import { createRuntimeEngine } from "../../packages/kernel-runtime/src/index.mjs";
import { createAuditEngine } from "../../packages/kernel-audit/src/index.mjs";

const NOW = "2026-07-19T01:00:00.000Z";
const TENANT_ID = "tenant_integration";

test("planning -> decision -> policy -> runtime -> evidence -> audit", async () => {
  const clock = () => NOW;

  const reflection = {
    reflectionId: "reflection.audit.integration.1",
    findings: [
      {
        ruleId: "INT-AUD-001",
        severity: "low",
        subject: "governed-echo",
        statement: "A reversible local action is ready for governed execution.",
        recommendation: "Execute only with explicit approval and full traceability.",
        evidence: ["evidence:governed-echo"],
      },
    ],
  };

  const planning = createPlanningEngine({ clock }).plan(reflection);
  const decision = createDecisionEngine({ clock }).evaluate(planning);

  assert.equal(decision.decisionState, "ready-for-human-decision");
  assert.equal(decision.mutationAllowed, false);
  assert.equal(decision.executionAllowed, false);

  const plan = {
    planId: "plan.audit.integration.1",
    decisionId: decision.decisionId,
    proposalId: decision.selectedProposalId,
    steps: [
      {
        stepId: "step.echo.1",
        action: "echo",
        input: { message: "governed-local-execution" },
      },
    ],
  };
  plan.planHash = hashExecutionPlan(plan);

  const approval = {
    approvalId: "approval.audit.integration.1",
    status: "approved",
    approvedBy: "human.integration",
    tenantId: TENANT_ID,
    action: "echo",
    decisionId: decision.decisionId,
    proposalId: plan.proposalId,
    planHash: plan.planHash,
    expiresAt: "2026-07-20T01:00:00.000Z",
  };

  const policyDecision = createPolicyEngine({ clock }).evaluate({
    tenantId: TENANT_ID,
    action: { name: "echo", risk: "R1" },
    decision,
    plan,
    dryRun: false,
    approval,
  });

  assert.equal(policyDecision.effect, "allow");
  assert.equal(policyDecision.executionAllowed, true);
  assert.equal(policyDecision.mutationAllowed, true);
  assert.equal(policyDecision.planHash, plan.planHash);

  let handlerCalls = 0;
  const runtime = createRuntimeEngine({
    clock,
    actions: {
      echo: {
        risk: "R1",
        reversible: true,
        handler: async (input) => {
          handlerCalls += 1;
          return { ok: true, echoed: input.message };
        },
      },
    },
  });

  const runtimeReport = await runtime.run(decision, plan, {
    dryRun: false,
    approval,
    confirmation: "EXECUTE_APPROVED_PLAN",
    tenantId: TENANT_ID,
    correlationId: "corr.audit.integration.1",
  });

  assert.equal(runtimeReport.state, "executed");
  assert.equal(runtimeReport.steps.length, 1);
  assert.equal(runtimeReport.steps[0].status, "executed");
  assert.equal(handlerCalls, 1);

  const evidence = runtimeReport.evidence.map((record) => ({
    ...record,
    status: "active",
  }));

  const audit = createAuditEngine({
    clock,
    verifyEvidence: (record) =>
      Boolean(
        record?.evidenceId &&
          record?.status === "active" &&
          record?.payload?.reportId === runtimeReport.reportId,
      ),
  }).audit(
    {
      tenantId: TENANT_ID,
      decision,
      plan,
      policyDecision,
      approval,
      runtimeReport,
      evidence,
    },
    {
      requestedBy: "integration-test",
      scope: "governed-execution-contract",
    },
  );

  assert.equal(audit.status, "compliant");
  assert.equal(audit.summary.total, 5);
  assert.equal(audit.summary.pass, 5);
  assert.equal(audit.summary.fail, 0);
  assert.equal(audit.summary.unknown, 0);
  assert.equal(audit.mutationAllowed, false);
  assert.equal(audit.executionAllowed, false);
});
