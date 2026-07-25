import test from "node:test";
import assert from "node:assert/strict";

import { createConstitutionEngine } from "../src/index.mjs";

test("institutional constitutional gate marker", () => {
  const engine = createConstitutionEngine({
    clock: () => "2026-07-25T00:00:00.000Z",
  });

  const decision = engine.evaluate({
    tenantId: "tenant_gate",
    decisionId: "decision.gate",
    proposalId: "proposal.gate",
    action: {
      name: "unmatched-action",
      domain: "institution",
      risk: "R1",
      tags: [],
      authority: [],
      evidence: [],
      approvalPresent: false,
      backupPresent: false,
      rollbackPresent: false,
    },
    constitution: {
      constitutionId: "constitution.gate",
      version: "1.0.0",
      status: "active",
      tenantScope: ["tenant_gate"],
      defaultEffect: "deny",
      rules: [],
    },
  });

  assert.equal(decision.effect, "deny");
  assert.equal(decision.mutationAllowed, false);
  assert.equal(decision.executionAllowed, false);
  assert.equal(Object.isFrozen(decision), true);

  console.log("KERNEL_CONSTITUTION_GATE_OK");
});
