import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPolicyRuntimeHandoffContract,
  assertRuntimeReportContract,
  createPolicyRuntimeHandoff,
} from "../src/policy-runtime.mjs";
import { createTenantContext } from "../src/tenancy-context.mjs";

const tenantContext = createTenantContext({
  tenantId: "tenant_demo_0001",
  principalId: "principal.operator",
  requestId: "request.runtime.0001",
  createdAt: "2026-07-19T05:00:00.000Z",
});

const decisionReport = {
  decisionId: "decision.0001",
  generatedAt: "2026-07-19T05:01:00.000Z",
  requestedBy: "principal.operator",
  scope: "tenant",
  sourcePlanningId: "planning.0001",
  sourceReflectionId: "reflection.0001",
  mode: "advisory",
  selectedProposalId: "proposal.0001",
  decisionState: "ready-for-human-decision",
  recommendation: "submit-for-human-approval",
  rationale: "Governed proposal available.",
  gates: { missingEvidence: [], missingReviews: [], constitutionalConflict: false },
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
  generatedAt: "2026-07-19T05:02:00.000Z",
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
    input: { value: 1 },
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

const previewPolicy = {
  policyDecisionId: "policy.0001",
  evaluatedAt: "2026-07-19T05:03:00.000Z",
  tenantId: "tenant_demo_0001",
  action: { name: "echo", risk: "R1", tags: [], input: { value: 1 } },
  risk: "R1",
  dryRun: true,
  effect: "allow",
  reasons: [],
  planHash: "planhash.0001",
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
  cycleId: "cycle.0001",
  sourceHandoffId: "handoff.decision.policy.0001",
  decisionId: "decision.0001",
  planId: "plan.0001",
};

test("creates a preview-only policy -> runtime handoff", () => {
  const handoff = createPolicyRuntimeHandoff({
    handoffId: "handoff.policy.runtime.0001",
    cycleId: "cycle.0001",
    tenantContext,
    policyDecision: previewPolicy,
    decisionReport,
    executionPlan,
    createdAt: "2026-07-19T05:04:00.000Z",
  });
  assert.equal(assertPolicyRuntimeHandoffContract(handoff), handoff);
  assert.equal(handoff.requestedMode, "preview");
  assert.equal(handoff.executionAllowed, false);
});

test("rejects execution policy without a bound approval", () => {
  assert.throws(() => createPolicyRuntimeHandoff({
    handoffId: "handoff.policy.runtime.0002",
    cycleId: "cycle.0001",
    tenantContext,
    policyDecision: {
      ...previewPolicy,
      dryRun: false,
      approvalRequired: true,
      previewAllowed: false,
      executionAllowed: true,
      mutationAllowed: true,
      approvalId: "approval.0001",
    },
    decisionReport,
    executionPlan,
  }), /must be an object/);
});

test("validates a preview runtime report without observed execution", () => {
  const report = {
    reportId: "runtime.0001",
    planId: "plan.0001",
    decisionId: "decision.0001",
    proposalId: "proposal.0001",
    tenantId: "tenant_demo_0001",
    cycleId: "cycle.0001",
    sourceHandoffId: "handoff.policy.runtime.0001",
    policyDecisionId: "policy.0001",
    approvalId: null,
    requestedMode: "preview",
    dryRun: true,
    state: "previewed",
    startedAt: "2026-07-19T05:05:00.000Z",
    endedAt: "2026-07-19T05:05:01.000Z",
    executionAuthorized: false,
    executionObserved: false,
    mutationObserved: false,
    steps: [{ stepId: "step.0001", action: "echo", status: "previewed" }],
    evidence: [{ evidenceId: "evidence.0001" }],
    constraints: {
      policyGateRequired: true,
      explicitConfirmationRequired: true,
      automaticExecutionAllowed: false,
      tenantIsolationRequired: true,
      evidenceRequired: true,
    },
  };
  assert.equal(assertRuntimeReportContract(report), report);
});
