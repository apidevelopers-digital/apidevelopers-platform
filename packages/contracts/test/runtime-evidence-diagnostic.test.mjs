import test from "node:test";
import assert from "node:assert/strict";
import { assertRuntimeReportContract } from "../src/policy-runtime.mjs";

const runtimeReport = {
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
  startedAt: "2026-07-19T06:01:00.000Z",
  endedAt: "2026-07-19T06:01:01.000Z",
  executionAuthorized: false,
  executionObserved: false,
  mutationObserved: false,
  steps: [{
    stepId: "step.0001",
    action: "echo",
    status: "previewed",
    risk: "R1",
    output: { planned: true },
  }],
  evidence: [{
    evidenceId: "runtime-step.0001",
    stepId: "step.0001",
    status: "previewed",
  }],
  constraints: {
    policyGateRequired: true,
    explicitConfirmationRequired: true,
    automaticExecutionAllowed: false,
    tenantIsolationRequired: true,
    evidenceRequired: true,
  },
};

test("runtime evidence report fixture", () => {
  assert.equal(assertRuntimeReportContract(runtimeReport), runtimeReport);
});
