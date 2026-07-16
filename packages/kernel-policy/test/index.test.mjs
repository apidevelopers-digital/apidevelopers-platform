import test from "node:test";
import assert from "node:assert/strict";
import {
  createPolicyEngine,
  hashExecutionPlan,
  policyRiskLevels,
} from "../src/index.mjs";

const NOW = "2026-07-16T22:00:00.000Z";
const decision = {
  decisionId: "decision.1",
  selectedProposalId: "proposal.1",
  decisionState: "ready-for-human-decision",
  gates: { constitutionalConflict: false },
};
const plan = {
  planId: "plan.1",
  decisionId: "decision.1",
  proposalId: "proposal.1",
  steps: [{ stepId: "1", action: "echo", input: { value: 1 } }],
};
const action = { name: "echo", risk: "R1", input: { value: 1 } };

function engine() {
  return createPolicyEngine({ clock: () => NOW });
}
function approval(overrides = {}) {
  return {
    approvalId: "approval.1",
    status: "approved",
    approvedBy: "human.1",
    tenantId: "tenant_alpha",
    action: "echo",
    decisionId: "decision.1",
    proposalId: "proposal.1",
    planHash: hashExecutionPlan(plan),
    expiresAt: "2026-07-17T22:00:00.000Z",
    ...overrides,
  };
}

test("exports the canonical R0-R5 scale", () => {
  assert.deepEqual(policyRiskLevels, ["R0", "R1", "R2", "R3", "R4", "R5"]);
});

test("allows a safe dry-run without approval", () => {
  const result = engine().evaluate({
    tenantId: "tenant_alpha",
    action,
    decision,
    plan,
  });
  assert.equal(result.effect, "allow");
  assert.equal(result.previewAllowed, true);
  assert.equal(result.executionAllowed, false);
});

test("blocks R5 by default", () => {
  const result = engine().evaluate({
    tenantId: "tenant_alpha",
    action: { name: "danger", risk: "R5" },
    decision,
    plan,
  });
  assert.equal(result.effect, "deny");
  assert.ok(result.reasons.includes("risk-r5-blocked"));
});

test("raises legal and health contexts to R4", () => {
  const result = engine().evaluate({
    tenantId: "tenant_alpha",
    action,
    decision,
    plan,
    context: { tags: ["legal"] },
  });
  assert.equal(result.risk, "R4");
  assert.equal(result.humanReviewRequired, true);
});

test("requires approval for real execution", () => {
  const result = engine().evaluate({
    tenantId: "tenant_alpha",
    action,
    decision,
    plan,
    dryRun: false,
  });
  assert.equal(result.effect, "review");
  assert.ok(result.reasons.includes("approval-required"));
});

test("accepts a valid approval bound to the plan", () => {
  const result = engine().evaluate({
    tenantId: "tenant_alpha",
    action,
    decision,
    plan,
    dryRun: false,
    approval: approval(),
  });
  assert.equal(result.effect, "allow");
  assert.equal(result.executionAllowed, true);
});

test("rejects cross-tenant approval", () => {
  const result = engine().evaluate({
    tenantId: "tenant_alpha",
    action,
    decision,
    plan,
    dryRun: false,
    approval: approval({ tenantId: "tenant_beta" }),
  });
  assert.equal(result.effect, "review");
  assert.ok(result.reasons.includes("approval-tenant-mismatch"));
});

test("invalidates approval when the plan changes", () => {
  const changed = structuredClone(plan);
  changed.steps[0].input.value = 2;
  const result = engine().evaluate({
    tenantId: "tenant_alpha",
    action,
    decision,
    plan: changed,
    dryRun: false,
    approval: approval(),
  });
  assert.equal(result.effect, "review");
  assert.ok(result.reasons.includes("approval-plan-mismatch"));
});

test("rejects expired and replayed approvals", () => {
  const expired = engine().evaluate({
    tenantId: "tenant_alpha",
    action,
    decision,
    plan,
    dryRun: false,
    approval: approval({ expiresAt: "2026-07-15T22:00:00.000Z" }),
  });
  assert.ok(expired.reasons.includes("approval-expired"));

  const replay = engine().evaluate({
    tenantId: "tenant_alpha",
    action,
    decision,
    plan,
    dryRun: false,
    approval: approval({ consumedAt: NOW }),
  });
  assert.ok(replay.reasons.includes("approval-replayed"));
});

test("blocks secret-like material", () => {
  const result = engine().evaluate({
    tenantId: "tenant_alpha",
    action: { name: "configure", risk: "R1", input: { api_key: "abc" } },
    decision,
    plan,
  });
  assert.equal(result.risk, "R5");
  assert.equal(result.effect, "deny");
});

test("blocks constitutional conflict and non-ready decisions", () => {
  const result = engine().evaluate({
    tenantId: "tenant_alpha",
    action,
    decision: {
      ...decision,
      decisionState: "blocked",
      gates: { constitutionalConflict: true },
    },
    plan,
  });
  assert.equal(result.effect, "deny");
  assert.ok(result.reasons.includes("constitutional-conflict"));
  assert.ok(result.reasons.includes("decision-not-ready"));
});

test("hash is deterministic across object key order", () => {
  const reordered = {
    steps: [{ input: { value: 1 }, action: "echo", stepId: "1" }],
    proposalId: "proposal.1",
    decisionId: "decision.1",
    planId: "plan.1",
  };
  assert.equal(hashExecutionPlan(plan), hashExecutionPlan(reordered));
});
