import test from "node:test";
import assert from "node:assert/strict";
import { createPolicyEngine, hashExecutionPlan, policyRiskLevels } from "../src/index.mjs";

const NOW = "2026-07-26T04:00:00.000Z";
const decision = {
  decisionId: "decision.1", tenantId: "tenant_alpha", cycleId: "cycle_1",
  selectedProposalId: "proposal.1", decisionState: "ready-for-human-decision",
  gates: { constitutionalConflictFree: true },
  approved: false, mutationAllowed: false, executionAllowed: false,
};
const plan = {
  planId: "plan.1", tenantId: "tenant_alpha", cycleId: "cycle_1",
  decisionId: "decision.1", proposalId: "proposal.1",
  steps: [{ stepId: "1", action: "echo", input: { value: 1 } }],
};
const action = { name: "echo", risk: "R1", input: { value: 1 } };
const engine = () => createPolicyEngine({ clock: () => NOW });
const approval = (overrides = {}) => ({
  approvalId: "approval.1", status: "approved", approvedBy: "human.1",
  tenantId: "tenant_alpha", cycleId: "cycle_1", action: "echo",
  decisionId: "decision.1", proposalId: "proposal.1",
  planHash: hashExecutionPlan(plan),
  expiresAt: "2026-07-27T04:00:00.000Z", ...overrides,
});

test("exports canonical risk scale and safe preview never executes", () => {
  assert.deepEqual(policyRiskLevels, ["R0","R1","R2","R3","R4","R5"]);
  const result = engine().evaluate({ tenantId: "tenant_alpha", cycleId: "cycle_1", action, decision, plan });
  assert.equal(result.effect, "allow");
  assert.equal(result.previewAllowed, true);
  assert.equal(result.executionAllowed, false);
  assert.equal(result.mutationAllowed, false);
  assert.equal(Object.isFrozen(result), true);
});

test("blocks R5, secrets and constitutional conflict", () => {
  const r5 = engine().evaluate({ tenantId: "tenant_alpha", cycleId: "cycle_1",
    action: { name: "danger", risk: "R5" }, decision,
    plan: { ...plan, steps: [{ ...plan.steps[0], action: "danger" }] } });
  assert.equal(r5.effect, "deny");
  const secret = engine().evaluate({ tenantId: "tenant_alpha", cycleId: "cycle_1",
    action: { name: "echo", risk: "R1", input: { api_key: "abc" } }, decision, plan });
  assert.equal(secret.risk, "R5");
  const conflict = engine().evaluate({ tenantId: "tenant_alpha", cycleId: "cycle_1",
    action, decision: { ...decision, gates: { constitutionalConflictFree: false } }, plan });
  assert.ok(conflict.reasons.includes("constitutional-conflict-or-unverified"));
});

test("real authorization requires plan-bound approval", () => {
  const missing = engine().evaluate({ tenantId: "tenant_alpha", cycleId: "cycle_1",
    action, decision, plan, dryRun: false });
  assert.equal(missing.effect, "review");
  const valid = engine().evaluate({ tenantId: "tenant_alpha", cycleId: "cycle_1",
    action, decision, plan, dryRun: false, approval: approval() });
  assert.equal(valid.effect, "allow");
  assert.equal(valid.executionAllowed, true);
  assert.equal(valid.approvalId, "approval.1");
  const changed = structuredClone(plan);
  changed.steps[0].input.value = 2;
  const rejected = engine().evaluate({ tenantId: "tenant_alpha", cycleId: "cycle_1",
    action, decision, plan: changed, dryRun: false, approval: approval() });
  assert.ok(rejected.reasons.includes("approval-plan-mismatch"));
});

test("blocks cross-tenant, cross-cycle and action mismatch", () => {
  const result = engine().evaluate({ tenantId: "tenant_alpha", cycleId: "cycle_1",
    action, decision: { ...decision, tenantId: "tenant_beta", cycleId: "cycle_2" },
    plan: { ...plan, tenantId: "tenant_beta", cycleId: "cycle_2",
      steps: [{ ...plan.steps[0], action: "other" }] } });
  assert.equal(result.effect, "deny");
  assert.ok(result.reasons.includes("decision-tenant-mismatch"));
  assert.ok(result.reasons.includes("plan-cycle-mismatch"));
  assert.ok(result.reasons.includes("action-plan-mismatch"));
});

test("plan hash is deterministic and inputs remain unchanged", () => {
  const reordered = { steps: [{ input: { value: 1 }, action: "echo", stepId: "1" }],
    proposalId: "proposal.1", decisionId: "decision.1", cycleId: "cycle_1",
    tenantId: "tenant_alpha", planId: "plan.1" };
  assert.equal(hashExecutionPlan(plan), hashExecutionPlan(reordered));
  const input = { tenantId: "tenant_alpha", cycleId: "cycle_1",
    action: structuredClone(action), decision: structuredClone(decision),
    plan: structuredClone(plan), approval: approval(), dryRun: false };
  const before = structuredClone(input);
  engine().evaluate(input);
  assert.deepEqual(input, before);
});
