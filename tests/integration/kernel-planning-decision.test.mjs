
import test from "node:test";
import assert from "node:assert/strict";

import { createPlanningEngine } from "../../packages/kernel-planning/src/index.mjs";
import { createDecisionEngine } from "../../packages/kernel-decision/src/index.mjs";

const planningClock = () => "2026-07-16T16:00:00.000Z";
const decisionClock = () => "2026-07-16T16:01:00.000Z";

test("PlanningReport flows into DecisionRecord without mutation, approval, or execution", () => {
  const reflection = {
    reflectionId: "reflection.integration.0001",
    findings: [
      {
        ruleId: "RSN-001",
        subject: "capability.publisher",
        category: "architecture",
        severity: "medium",
        statement: "Capability has no active provider.",
        recommendation: "Register a governed provider.",
        evidence: ["evidence:capability.publisher"],
      },
    ],
  };

  const planning = createPlanningEngine({ clock: planningClock }).plan(reflection);
  const planningBefore = structuredClone(planning);

  const decision = createDecisionEngine({ clock: decisionClock }).evaluate(planning);

  assert.deepEqual(planning, planningBefore);
  assert.equal(decision.sourcePlanningId, planning.planningId);
  assert.equal(decision.sourceReflectionId, reflection.reflectionId);
  assert.equal(decision.selectedProposalId, planning.proposals[0].proposalId);
  assert.equal(decision.decisionState, "ready-for-human-decision");
  assert.equal(decision.recommendation, "submit-for-human-approval");
  assert.equal(decision.humanApprovalRequired, true);
  assert.equal(decision.approved, false);
  assert.equal(decision.mutationAllowed, false);
  assert.equal(decision.executionAllowed, false);
  assert.equal(decision.constraints.automaticDecisionAllowed, false);
  assert.equal(decision.constraints.automaticApprovalAllowed, false);
  assert.equal(decision.constraints.automaticExecutionAllowed, false);
});
