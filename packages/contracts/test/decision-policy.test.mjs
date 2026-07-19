import test from "node:test";
import assert from "node:assert/strict";

import {
  assertDecisionPolicyHandoffContract,
  assertPolicyDecisionContract,
  createDecisionPolicyHandoff,
} from "../src/decision-policy.mjs";
import { createTenantContext } from "../src/tenancy-context.mjs";

const tenantContext = createTenantContext({
  tenantId: "tenant_demo_0001",
  principalId: "principal.operator",
  requestId: "request.contracts.policy.0001",
  createdAt: "2026-07-19T04:00:00.000Z",
});

const decisionReport = {
  decisionId: "decision.0001",
  generatedAt: "2026-07-19T04:01:00.000Z",
  requestedBy: "principal.operator",
  scope: "tenant",
  sourcePlanningId: "planning.0001",
  sourceReflectionId: "reflection.0001",
  mode: "advisory",
  selectedProposalId: "proposal.0001",
  decisionState: "ready-for-human-decision",
  recommendation: "submit-for-human-approval",
  rationale: "A governed proposal is available.",
  gates: {
    missingEvidence: [],
    missingReviews: [],
    constitutionalConflict: false,
  },
  candidates: [{
    proposalId: "proposal.0001",
    sourceReflectionId: "reflection.0001",
    sourceReferences: [],
    subject: "safe.echo",
    category: "operation",
    priority: "low",
    rationale: "Preview a reversible local action.",
    requiredEvidence: [],
    requiredReviews: [],
    decisionState: "proposed",
    constitutionalConflict: false,
  }],
  humanApprovalRequired: true,
  approved: false,
  mutationAllowed: false,
  executionAllowed: false,
  constraints: {
    automaticDecisionAllowed: false,
    automaticApprovalAllowed: false,
    automaticExecutionAllowed: false,
    traceabilityRequired: true,
    sourceOfTruth: "governed-planning-report",
  },
  cycleId: "cycle.0001",
  tenantId: "tenant_demo_0001",
  sourceHandoffId: "handoff.planning.decision.0001",
};

const executionPlan = {
  planId: "plan.0001",
  generatedAt: "2026-07-19T04:02:00.000Z",
  requestedBy: "principal.operator",
  tenantId: "tenant_demo_0001",
  decisionId: "decision.0001",
  proposalId: "proposal.0001",
  sourcePlanningId: "planning.0001",
  sourceReflectionId: "reflection.0001",
  objective: "Preview a governed echo action.",
  status: "draft",
  mode: "contract-adapter",
  steps: [{
    stepId: "step.0001",
    action: "echo",
    input: { message: "preview-only" },
    risk: "R1",
    dependsOn: [],
    evidenceRequired: [],
  }],
  constraints: {
    humanApprovalRequired: true,
    automaticMutationAllowed: false,
    automaticApprovalAllowed: false,
    automaticExecutionAllowed: false,
    mutationAllowed: false,
    executionAllowed: false,
  },
};

const action = {
  name: "echo",
  risk: "R1",
  input: { message: "preview-only" },
};

test("creates the governed decision -> policy handoff", () => {
  const handoff = createDecisionPolicyHandoff({
    handoffId: "handoff.decision.policy.0001",
    cycleId: "cycle.0001",
    tenantContext,
    decisionReport,
    executionPlan,
    action,
    createdAt: "2026-07-19T04:03:00.000Z",
  });

  assert.equal(assertDecisionPolicyHandoffContract(handoff), handoff);
  assert.equal(handoff.mutationAllowed, false);
  assert.equal(handoff.approvalAllowed, false);
  assert.equal(handoff.executionAllowed, false);
});

test("rejects a plan that is not bound to the decision", () => {
  assert.throws(
    () => createDecisionPolicyHandoff({
      handoffId: "handoff.decision.policy.0002",
      cycleId: "cycle.0001",
      tenantContext,
      decisionReport,
      executionPlan: {
        ...executionPlan,
        decisionId: "decision.other",
      },
      action,
    }),
    /decisionId mismatch/,
  );
});

test("validates dry-run policy output without enabling execution", () => {
  const report = {
    policyDecisionId: "policy.0001",
    evaluatedAt: "2026-07-19T04:04:00.000Z",
    tenantId: "tenant_demo_0001",
    cycleId: "cycle.0001",
    sourceHandoffId: "handoff.decision.policy.0001",
    decisionId: "decision.0001",
    planId: "plan.0001",
    action,
    risk: "R1",
    dryRun: true,
    effect: "allow",
    reasons: [],
    planHash: "hash",
    approvalRequired: false,
    humanReviewRequired: false,
    previewAllowed: true,
    executionAllowed: false,
    mutationAllowed: false,
    approvalId: null,
    constraints: {
      denyByDefault: true,
      tenantIsolationRequired: true,
      traceabilityRequired: true,
      approvalBoundToPlan: true,
      approvalReplayAllowed: false,
      riskFloorForLegalAndHealth: "R4",
      riskR5Blocked: true,
    },
  };

  assert.equal(assertPolicyDecisionContract(report), report);
});

test("rejects real execution without a bound approval identifier", () => {
  assert.throws(
    () => assertPolicyDecisionContract({
      policyDecisionId: "policy.0002",
      evaluatedAt: "2026-07-19T04:05:00.000Z",
      tenantId: "tenant_demo_0001",
      cycleId: "cycle.0001",
      sourceHandoffId: "handoff.decision.policy.0001",
      decisionId: "decision.0001",
      planId: "plan.0001",
      action,
      risk: "R1",
      dryRun: false,
      effect: "allow",
      reasons: [],
      planHash: "hash",
      approvalRequired: true,
      humanReviewRequired: false,
      previewAllowed: false,
      executionAllowed: true,
      mutationAllowed: true,
      approvalId: null,
      constraints: {
        denyByDefault: true,
        tenantIsolationRequired: true,
        traceabilityRequired: true,
        approvalBoundToPlan: true,
        approvalReplayAllowed: false,
        riskFloorForLegalAndHealth: "R4",
        riskR5Blocked: true,
      },
    }),
    /approvalId must be a non-empty string/,
  );
});
