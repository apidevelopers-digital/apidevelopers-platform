import test from "node:test";
import assert from "node:assert/strict";

import {
  PlanningExecutionPlanAdapter,
  adaptPlanningDecisionToExecutionPlan,
  contractVersions,
  createPlanningExecutionPlanAdapter,
} from "../src/index.mjs";

const NOW = "2026-07-17T06:00:00.000Z";
const clock = () => NOW;

function fixtures() {
  const planningReport = {
    planningId: "planning.001",
    sourceReflectionId: "reflection.001",
    objective: "governed-evolution",
    proposals: [{
      proposalId: "proposal.001",
      sourceReflectionId: "reflection.001",
      subject: "publisher",
      category: "runtime",
      priority: "high",
      recommendation: "Publish the governed artifact.",
      decisionState: "proposed",
      constitutionalConflict: false,
    }],
  };

  const decision = {
    decisionId: "decision.001",
    sourcePlanningId: "planning.001",
    sourceReflectionId: "reflection.001",
    selectedProposalId: "proposal.001",
    decisionState: "ready-for-human-decision",
    approved: false,
    mutationAllowed: false,
    executionAllowed: false,
  };

  return { planningReport, decision };
}

function buildSteps(proposal, context) {
  return [{
    stepId: "step.001",
    action: "publish",
    input: {
      subject: proposal.subject,
      proposalId: context.proposalId,
    },
    risk: "R2",
    evidenceRequired: ["evidence.publisher"],
  }];
}

test("exports versioned shared contracts", () => {
  assert.deepEqual(contractVersions, {
    PlanningReport: "1.0.0",
    Decision: "1.0.0",
    ExecutionPlan: "1.0.0",
  });
  assert.equal(Object.isFrozen(contractVersions), true);
});

test("factory creates a PlanningExecutionPlanAdapter", () => {
  assert.equal(
    createPlanningExecutionPlanAdapter({ clock, buildSteps }) instanceof PlanningExecutionPlanAdapter,
    true,
  );
});

test("requires an explicit buildSteps function", () => {
  assert.throws(
    () => createPlanningExecutionPlanAdapter({ clock }),
    /buildSteps must be a function/,
  );
});

test("requires tenant, planning report and decision", () => {
  const adapter = createPlanningExecutionPlanAdapter({ clock, buildSteps });
  assert.throws(() => adapter.adapt(), /tenantId must be a non-empty string/);
  assert.throws(
    () => adapter.adapt({ tenantId: "tenant.001" }),
    /planningReport must be an object/,
  );
});

test("rejects decisions from another planning report", () => {
  const data = fixtures();
  data.decision.sourcePlanningId = "planning.other";
  assert.throws(
    () => adaptPlanningDecisionToExecutionPlan(
      { tenantId: "tenant.001", ...data },
      { clock, buildSteps },
    ),
    /does not match/,
  );
});

test("rejects decisions that are not ready for human decision", () => {
  const data = fixtures();
  data.decision.decisionState = "needs-evidence";
  assert.throws(
    () => adaptPlanningDecisionToExecutionPlan(
      { tenantId: "tenant.001", ...data },
      { clock, buildSteps },
    ),
    /ready-for-human-decision/,
  );
});

test("rejects unknown and blocked proposals", () => {
  const unknown = fixtures();
  unknown.decision.selectedProposalId = "proposal.other";
  assert.throws(
    () => adaptPlanningDecisionToExecutionPlan(
      { tenantId: "tenant.001", ...unknown },
      { clock, buildSteps },
    ),
    /selected proposal not found/,
  );

  const blocked = fixtures();
  blocked.planningReport.proposals[0].constitutionalConflict = true;
  assert.throws(
    () => adaptPlanningDecisionToExecutionPlan(
      { tenantId: "tenant.001", ...blocked },
      { clock, buildSteps },
    ),
    /constitutionally blocked/,
  );
});

test("rejects invalid or duplicate execution steps", () => {
  const data = fixtures();
  assert.throws(
    () => adaptPlanningDecisionToExecutionPlan(
      { tenantId: "tenant.001", ...data },
      { clock, buildSteps: () => [] },
    ),
    /non-empty array/,
  );
  assert.throws(
    () => adaptPlanningDecisionToExecutionPlan(
      { tenantId: "tenant.001", ...data },
      {
        clock,
        buildSteps: () => [
          { stepId: "step.001", action: "a" },
          { stepId: "step.001", action: "b" },
        ],
      },
    ),
    /duplicate stepId/,
  );
});

test("creates a distinct ExecutionPlan id and preserves planning traceability", () => {
  const data = fixtures();
  const plan = adaptPlanningDecisionToExecutionPlan(
    {
      tenantId: "tenant.001",
      requestedBy: "operator",
      ...data,
    },
    { clock, buildSteps },
  );

  assert.equal(plan.planId, "plan.20260717060000000.proposal.001");
  assert.notEqual(plan.planId, plan.sourcePlanningId);
  assert.equal(plan.sourcePlanningId, "planning.001");
  assert.equal(plan.sourceReflectionId, "reflection.001");
  assert.equal(plan.decisionId, "decision.001");
  assert.equal(plan.proposalId, "proposal.001");
  assert.equal(plan.tenantId, "tenant.001");
  assert.equal(plan.requestedBy, "operator");
  assert.equal(plan.status, "draft");
  assert.equal(plan.mode, "contract-adapter");
});

test("maps executable steps only through the explicit factory", () => {
  const plan = adaptPlanningDecisionToExecutionPlan(
    { tenantId: "tenant.001", ...fixtures() },
    { clock, buildSteps },
  );

  assert.deepEqual(plan.steps, [{
    stepId: "step.001",
    action: "publish",
    input: {
      subject: "publisher",
      proposalId: "proposal.001",
    },
    risk: "R2",
    dependsOn: [],
    evidenceRequired: ["evidence.publisher"],
  }]);
});

test("keeps the plan non-executable until downstream governance", () => {
  const plan = adaptPlanningDecisionToExecutionPlan(
    { tenantId: "tenant.001", ...fixtures() },
    { clock, buildSteps },
  );

  assert.deepEqual(plan.constraints, {
    humanApprovalRequired: true,
    automaticMutationAllowed: false,
    automaticApprovalAllowed: false,
    automaticExecutionAllowed: false,
    mutationAllowed: false,
    executionAlowed: false,
  });
});

test("does not mutate planning, decision, proposal or factory context", () => {
  const data = fixtures();
  const before = structuredClone(data);

  adaptPlanningDecisionToExecutionPlan(
    { tenantId: "tenant.001", ...data },
   {
      clock,
      buildSteps: (proposal, context) => {
        assert.equal(Object.isFrozen(proposal), true);
        assert.equal(Object.isFrozen(context), true);
        return buildSteps(proposal, context);
      },
    },
   );

  assert.deepEqual(data, before);
});

test("produces a frozen deterministic plan for stable input and clock", () => {
  const first = adaptPlanningDecisionToExecutionPlan(
    { tenantId: "tenant.001", ...fixtures() },
    { clock, buildSteps },
  );
  const second = adaptPlanningDecisionToExecutionPlan(
    { tenantId: "tenant.001", ...fixtures() },
    { clock, buildSteps },
  );

  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.steps), true);
  assert.equal(Object.isFrozen(first.steps[0]), true);
  assert.equal(Object.isFrozen(first.constraints), true);
});
