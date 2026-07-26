import test from "node:test";
import assert from "node:assert/strict";

import {
  createPolicyRuntimeHandoff,
} from "@apidevelopers/contracts";
import { createRuntimeEngine } from "../src/index.mjs";
import { runGovernedRuntime } from "../src/governed.mjs";

const NOW = "2026-07-26T12:10:00.000Z";
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
  permissions: ["kernel.runtime.preview"],
  createdAt: NOW,
};

const decisionReport = {
  decisionId: "decision.vertical",
  generatedAt: NOW,
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

const policyDecision = {
  policyDecisionId: "policy.vertical",
  evaluatedAt: NOW,
  tenantId: "tenant_vertical",
  cycleId: "cycle.vertical",
  sourceHandoffId: "handoff.decision-policy.vertical",
  decisionId: "decision.vertical",
  planId: "plan.vertical",
  action: { name: "echo", risk: "R1", input: { message: "preview" } },
  risk: "R1",
  effect: "allow",
  reasons: [],
  dryRun: true,
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
    riskR5Blocked: true,
    approvalReplayAllowed: false,
  },
};

test("emits the canonical runtime report consumed by evidence", async () => {
  let calls = 0;
  const engine = createRuntimeEngine({
    clock: () => NOW,
    actions: {
      echo: async () => {
        calls += 1;
        return { ok: true };
      },
    },
  });
  const handoff = createPolicyRuntimeHandoff({
    handoffId: "handoff.policy-runtime.vertical",
    cycleId: "cycle.vertical",
    tenantContext,
    policyDecision,
    decisionReport,
    executionPlan,
    createdAt: NOW,
  });

  const report = await runGovernedRuntime({ handoff, engine });

  assert.equal(report.reportId, "runtime-report.runtime.20260726121000000");
  assert.equal(report.requestedMode, "preview");
  assert.equal(report.state, "previewed");
  assert.equal(report.executionObserved, false);
  assert.equal(report.steps[0].status, "previewed");
  assert.equal(report.evidence.length, 1);
  assert.equal(calls, 0);
});
