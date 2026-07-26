import test from "node:test";
import assert from "node:assert/strict";
import { createPolicyEngine } from "../src/index.mjs";

test("institutional kernel policy gate marker", () => {
  const result = createPolicyEngine({
    clock: () => "2026-07-26T04:00:00.000Z",
  }).evaluate({
    tenantId: "tenant_alpha",
    cycleId: "cycle_1",
    action: { name: "preview", risk: "R1" },
    decision: {
      decisionId: "decision.1",
      tenantId: "tenant_alpha",
      cycleId: "cycle_1",
      selectedProposalId: "proposal.1",
      decisionState: "ready-for-human-decision",
      gates: { constitutionalConflictFree: true },
      approved: false,
      mutationAllowed: false,
      executionAllowed: false,
    },
    plan: {
      planId: "plan.1",
      tenantId: "tenant_alpha",
      cycleId: "cycle_1",
      decisionId: "decision.1",
      proposalId: "proposal.1",
      steps: [{ stepId: "1", action: "preview" }],
    },
  });

  assert.equal(result.effect, "allow");
  assert.equal(result.executionAllowed, false);
  console.log("KERNEL_POLICY_GATE_OK");
});
