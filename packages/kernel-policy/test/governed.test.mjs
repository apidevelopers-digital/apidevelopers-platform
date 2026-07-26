import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPolicyDecisionContract,
  assertPolicyRuntimeHandoffContract,
  createDecisionPolicyHandoff,
  createTenantContext,
} from "@apidevelopers/contracts";
import {
  createGovernedPolicyRuntimeHandoff,
  runGovernedPolicy,
} from "../src/governed.mjs";
import { hashExecutionPlan } from "../src/index.mjs";

const NOW = "2026-07-26T04:00:00.000Z";
const tenantContext = createTenantContext({
  tenantId: "tenant_alpha",
  principalId: "human.1",
  requestId: "request.1",
  roles: ["operator"],
  permissions: ["policy:preview", "policy:execute"],
  createdAt: NOW,
});
const decisionReport = {
  decisionId: "decision.1", generatedAt: NOW, requestedBy: "human.1",
  tenantId: "tenant_alpha", cycleId: "cycle_1",
  sourcePlanningId: "planning.1", mode: "advisory",
  selectedProposalId: "proposal.1",
  decisionState: "ready-for-human-decision",
  recommendation: "Recommend proposal.1 for explicit human decision.",
  candidates: [{ proposalId: "proposal.1", priority: "high", rationale: "bounded",
    requiredEvidence: [], requiredReviews: [], constitutionalConflict: false,
    decisionState: "ready-for-human-decision", missingEvidence: [],
    missingReviews: [], eligible: true }],
  gates: { evidenceSatisfied: true, reviewsSatisfied: true, constitutionalConflictFree: true },
  approved: false, humanApprovalRequired: true, humanDecisionRequired: true,
  mutationAllowed: false, executionAllowed: false,
  constraints: { automaticDecisionAllowed: false, automaticApprovalAllowed: false,
    automaticExecutionAllowed: false, tenantIsolationRequired: true, traceabilityRequired: true },
};
const executionPlan = {
  planId: "plan.1", generatedAt: NOW, requestedBy: "human.1",
  tenantId: "tenant_alpha", cycleId: "cycle_1",
  decisionId: "decision.1", proposalId: "proposal.1",
  sourcePlanningId: "planning.1", sourceReflectionId: "reflection.1",
  objective: "preview governed echo", status: "draft", mode: "contract-adapter",
  steps: [{ stepId: "step.1", action: "echo", input: { value: 1 },
    risk: "R1", dependsOn: [], evidenceRequired: [] }],
  constraints: { humanApprovalRequired: true, automaticMutationAllowed: false,
    automaticApprovalAllowed: false, automaticExecutionAllowed: false,
    mutationAllowed: false, executionAllowed: false },
};
const handoff = () => createDecisionPolicyHandoff({
  handoffId: "handoff.decision-policy.1", cycleId: "cycle_1",
  tenantContext, decisionReport, executionPlan,
  action: { name: "echo", risk: "R1", input: { value: 1 } },
  createdAt: NOW,
});
const approval = {
  approvalId: "approval.1", status: "approved", approvedBy: "human.1",
  tenantId: "tenant_alpha", cycleId: "cycle_1", action: "echo",
  decisionId: "decision.1", proposalId: "proposal.1",
  planHash: hashExecutionPlan(executionPlan),
  expiresAt: "2026-07-27T04:00:00.000Z",
};

test("governed preview preserves explicit execution block", () => {
  const report = runGovernedPolicy({ handoff: handoff() });
  assertPolicyDecisionContract(report);
  assert.equal(report.effect, "allow");
  assert.equal(report.executionAllowed, false);
  const runtime = createGovernedPolicyRuntimeHandoff({
    handoffId: "handoff.policy-runtime.1", policyDecision: report,
    decisionReport, executionPlan, tenantContext, createdAt: NOW,
  });
  assertPolicyRuntimeHandoffContract(runtime);
  assert.equal(runtime.requestedMode, "preview");
});

test("real authorization requires and carries explicit approval", () => {
  const report = runGovernedPolicy({ handoff: handoff(), dryRun: false, approval });
  assertPolicyDecisionContract(report);
  assert.equal(report.executionAllowed, true);
  assert.equal(report.approvalId, "approval.1");
  const runtime = createGovernedPolicyRuntimeHandoff({
    handoffId: "handoff.policy-runtime.2", policyDecision: report,
    decisionReport, executionPlan, approval, tenantContext, createdAt: NOW,
  });
  assertPolicyRuntimeHandoffContract(runtime);
  assert.equal(runtime.requestedMode, "execute");
  assert.equal(runtime.automaticExecutionAllowed, false);
  assert.equal(runtime.explicitConfirmationRequired, true);
});
