import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeEngine } from "../../packages/kernel-runtime/src/index.mjs";
import {
  createEvidenceRegistry,
  verifyEvidence,
} from "../../packages/kernel-evidence/src/index.mjs";
import { createAuditEngine } from "../../packages/kernel-audit/src/index.mjs";

test("executes a governed Runtime -> Evidence -> Audit cycle", async () => {
  const tenantId = "tenant.e2e";
  const decision = {
    decisionId: "decision.e2e.001",
    decisionState: "ready-for-human-decision",
    selectedProposalId: "proposal.e2e.001",
    humanApprovalRequired: true,
    approved: false,
    mutationAllowed: false,
    executionAllowed: false,
    constraints: {
      automaticDecisionAllowed: false,
      automaticApprovalAllowed: false,
      automaticExecutionAllowed: false,
    },
    gates: { constitutionalConflict: false },
  };

  const plan = {
    planId: "plan.e2e.001",
    planHash: "sha256:e2e-plan-001",
    decisionId: decision.decisionId,
    proposalId: decision.selectedProposalId,
    steps: [{
      stepId: "step.e2e.001",
      action: "echo",
      input: { value: "kernel-e2e-ok" },
    }],
  };

  const approval = {
    approvalId: "approval.e2e.001",
    decisionId: decision.decisionId,
    proposalId: decision.selectedProposalId,
    tenantId,
    status: "approved",
    approvedBy: "authorized-human",
    expiresAt: "2026-07-23T00:00:00.000Z",
  };

  const runtime = createRuntimeEngine({
    clock: () => "2026-07-22T12:01:00.000Z",
    actions: {
      echo: {
        risk: "R1",
        reversible: true,
        handler: async ({ value }) => ({ echoed: value }),
      },
    },
  });

  const runtimeReport = await runtime.run(decision, plan, {
    dryRun: false,
    approval,
    confirmation: "EXECUTE_APPROVED_PLAN",
    tenantId,
  });

  assert.equal(runtimeReport.state, "executed");
  assert.equal(runtimeReport.steps[0].output.echoed, "kernel-e2e-ok");

  const registry = createEvidenceRegistry({
    clock: () => "2026-07-22T12:01:00.000Z",
  });

  const evidence = registry.record({
    evidenceId: "evidence.runtime.e2e.001",
    tenantId,
    type: "runtime-report",
    source: {
      module: "@apidevelopers/kernel-runtime",
      reportId: runtimeReport.reportId,
    },
    payload: runtimeReport,
  });

  assert.equal(verifyEvidence(evidence), true);

  const audit = createAuditEngine({
    clock: () => "2026-07-22T12:02:00.000Z",
    verifyEvidence,
  }).audit({
    tenantId,
    decision,
    plan,
    policyDecision: {
      policyDecisionId: "policy.e2e.001",
      effect: "allow",
      executionAllowed: true,
      mutationAllowed: true,
      planHash: plan.planHash,
    },
    approval,
    runtimeReport,
    evidence: [evidence],
  }, {
    requestedBy: "integration-test",
    scope: "kernel-e2e",
  });

  assert.equal(audit.status, "compliant");
  assert.equal(audit.summary.fail, 0);
  assert.deepEqual(audit.evidence, ["evidence.runtime.e2e.001"]);
  assert.equal(audit.executionAllowed, false);
  assert.equal(audit.mutationAllowed, false);
});
