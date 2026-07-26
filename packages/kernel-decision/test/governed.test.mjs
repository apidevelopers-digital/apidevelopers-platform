import test from "node:test";
import assert from "node:assert/strict";

import {
  createDecisionPolicyHandoff,
} from "../src/governed.mjs";

const tenantContext = {
  schemaVersion: 1,
  tenantId: "tenant_vertical",
  tenantIdOpaque: true,
  isolationMode: "strict",
  crossTenantAccessAllowed: false,
  globalOperation: false,
  principalId: "operator.vertical",
  requestId: "request.vertical",
  roles: ["operator"],
  permissions: ["kernel.decision.read"],
  createdAt: "2026-07-26T12:00:00.000Z",
};

const decisionReport = {
  decisionId: "decision.vertical",
  generatedAt: "2026-07-26T12:00:00.000Z",
  requestedBy: "operator.vertical",
  tenantId: "tenant_vertical",
  cycleId: "cycle.vertical",
  sourcePlanningId: "planning.vertical",
  mode: "advisory",
  selectedProposalId: "proposal.vertical",
  decisionState: "ready-for-human-decision",
  recommendation: "Recommend proposal for explicit human decision.",
  candidates: [],
  gates: {
    evidenceSatisfied: true,
    reviewsSatisfied: true,
    constitutionalConflictFree: true,
  },
  approved: false,
  humanApprovalRequired: true,
  humanDecisionRequired: true,
  mutationAllowed: false,
  executionAllowed: false,
  constraints: {
    automaticDecisionAllowed: false,
    automaticApprovalAllowed: false,
    automaticExecutionAllowed: false,
    tenantIsolationRequired: true,
    traceabilityRequired: true,
  },
};

const executionPlan = {
  planId: "plan.vertical",
  decisionId: "decision.vertical",
  proposalId: "proposal.vertical",
  tenantId: "tenant_vertical",
  steps: [
    {
      stepId: "step.vertical",
      action: "echo",
      input: { message: "preview" },
    },
  ],
  constraints: {
    humanApprovalRequired: true,
    automaticMutationAllowed: false,
    automaticApprovalAllowed: false,
    automaticExecutionAllowed: false,
    mutationAllowed: false,
    executionAllowed: false,
  },
};

test("creates the dedicated decision to policy contract handoff", () => {
  const handoff = createDecisionPolicyHandoff({
    decisionReport,
    executionPlan,
    action: { name: "echo", risk: "R1", input: { message: "preview" } },
    tenantContext,
    handoffId: "handoff.decision-policy.vertical",
    createdAt: "2026-07-26T12:01:00.000Z",
  });

  assert.equal(handoff.from, "kernel-decision");
  assert.equal(handoff.to, "kernel-policy");
  assert.equal(handoff.payload.executionPlan.planId, "plan.vertical");
  assert.equal(handoff.payload.action.name, "echo");
  assert.equal(handoff.executionAllowed, false);
});
