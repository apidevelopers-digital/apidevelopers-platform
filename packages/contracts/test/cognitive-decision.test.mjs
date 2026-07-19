import test from "node:test";
import assert from "node:assert/strict";

import {
  assertCognitiveHandoffContract,
  assertDecisionReportContract,
  createCognitiveHandoff,
} from "../src/cognitive-pipeline.mjs";
import {
  createTenantContext,
} from "../src/tenancy-context.mjs";

const tenantContext = createTenantContext({
  tenantId: "tenant_demo_0001",
  principalId: "principal.operator",
  requestId: "request.contracts.decision.0001",
  createdAt: "2026-07-19T03:00:00.000Z",
});

const planningReport = {
  planningId: "planning.0001",
  sourceReflectionId: "reflection.0001",
  mode: "advisory",
  mutationAllowed: false,
  approvalAllowed: false,
  executionAllowed: false,
  summary: { proposalCount: 0 },
  proposals: [],
  constraints: {
    automaticMutationAllowed: false,
    automaticApprovalAlowed: false,
    automaticExecutionAllowed: false,
  },
};

const decisionReport = {
  decisionId: "decision.20260719030500000",
  generatedAt: "2026-07-19T03:05:00.000Z",
  requestedBy: "principal.operator",
  scope: "tenant",
  sourcePlanningId: "planning.0001",
  sourceReflectionId: "reflection.0001",
  mode: "advisory",
  selectedProposalId: null,
  decisionState: "no-candidate",
  recommendation: "defer",
  rationale: "No governed proposal is available.",
  gates: {
    missingEvidence: [],
    missingReviews: [],
    constitutionalConflict: false,
  },
  candidates: [],
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
};

test("accepts planning -> decision handoffs", () => {
  const handoff = createCognitiveHandoff({
    handoffId: "handoff.planning.decision.0001",
    from: "kernel-planning",
    to: "kernel-decision",
    cycleId: "cycle.0001",
    tenantContext,
    payload: { planningReport },
    createdAt: "2026-07-19T03:04:00.000Z",
  });

  assert.equal(assertCognitiveHandoffContract(handoff), handoff);
  assert.equal(handoff.mutationAllowed, false);
  assert.equal(handoff.approvalAllowed, false);
  assert.equal(handoff.executionAllowed, false);
});

test("validates advisory decisions that still require human approval", () => {
  assert.equal(
    assertDecisionReportContract(decisionReport),
    decisionReport,
  );
});

test("rejects decision reports that claim automatic approval", () => {
  assert.throws(
    () => assertDecisionReportContract({
      ...decisionReport,
      constraints: {
        ...decisionReport.constraints,
        automaticApprovalAllowed: true,
      },
    }),
    /automaticApprovalAllowed must be false/,
  );
});
