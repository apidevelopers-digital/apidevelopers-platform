import test from "node:test";
import assert from "node:assert/strict";
import { createPolicyEngine, hashExecutionPlan } from "../../../packages/kernel-policy/src/index.mjs";
import { createGuard } from "../src/index.mjs";

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

function fixture({ runtimeResult, runtimeError, registry } = {}) {
  const calls = [];
  const runtime = {
    async run(...args) {
      calls.push(args);
      if (runtimeError) throw runtimeError;
      return runtimeResult ?? {
        state: args[2].dryRun ? "previewed" : "executed",
        evidence: [],
      };
    },
  };
  const guard = createGuard({
    policyEngine: createPolicyEngine({ clock: () => NOW }),
    runtime,
    evidenceRegistry: registry,
    clock: () => NOW,
  });
  return { guard, calls };
}

test("allows dry-run and calls runtime once", async () => {
  const { guard, calls } = fixture();
  const result = await guard.run({
    tenantId: "tenant_alpha",
    action: { name: "echo", risk: "R1" },
    decision,
    plan,
  });
  assert.equal(result.state, "previewed");
  assert.equal(result.runtimeCalled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].dryRun, true);
});

test("blocks R5 before runtime", async () => {
  const { guard, calls } = fixture();
  const result = await guard.run({
    tenantId: "tenant_alpha",
    action: { name: "danger", risk: "R5" },
    decision,
    plan,
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.runtimeCalled, false);
  assert.equal(calls.length, 0);
});

test("returns review-required without approval", async () => {
  const { guard, calls } = fixture();
  const result = await guard.run({
    tenantId: "tenant_alpha",
    action: { name: "echo", risk: "R1" },
    decision,
    plan,
    dryRun: false,
  });
  assert.equal(result.state, "review-required");
  assert.equal(calls.length, 0);
});

test("executes a valid approved plan", async () => {
  const { guard, calls } = fixture();
  const result = await guard.run({
    tenantId: "tenant_alpha",
    action: { name: "echo", risk: "R1" },
    decision,
    plan,
    dryRun: false,
    approval: approval(),
    confirmation: "EXECUTE_APPROVED_PLAN",
  });
  assert.equal(result.state, "executed");
  assert.equal(result.approvalConsumed, true);
  assert.equal(guard.approvalConsumed("approval.1"), true);
  assert.equal(calls.length, 1);
});

test("blocks approval replay before runtime", async () => {
  const { guard, calls } = fixture();
  const request = {
    tenantId: "tenant_alpha",
    action: { name: "echo", risk: "R1" },
    decision,
    plan,
    dryRun: false,
    approval: approval(),
    confirmation: "EXECUTE_APPROVED_PLAN",
  };
  await guard.run(request);
  const replay = await guard.run(request);
  assert.equal(replay.state, "blocked");
  assert.ok(replay.policy.reasons.includes("approval-replayed"));
  assert.equal(calls.length, 1);
});

test("blocks cross-tenant approval", async () => {
  const { guard, calls } = fixture();
  const result = await guard.run({
    tenantId: "tenant_alpha",
    action: { name: "echo", risk: "R1" },
    decision,
    plan,
    dryRun: false,
    approval: approval({ tenantId: "tenant_beta" }),
  });
  assert.equal(result.state, "review-required");
  assert.equal(calls.length, 0);
});

test("blocks changed plan with stale approval", async () => {
  const { guard, calls } = fixture();
  const changed = structuredClone(plan);
  changed.steps[0].input.value = 2;
  const result = await guard.run({
    tenantId: "tenant_alpha",
    action: { name: "echo", risk: "R1" },
    decision,
    plan: changed,
    dryRun: false,
    approval: approval(),
  });
  assert.equal(result.state, "review-required");
  assert.ok(result.policy.reasons.includes("approval-plan-mismatch"));
  assert.equal(calls.length, 0);
});

test("blocks expired approval", async () => {
  const { guard, calls } = fixture();
  const result = await guard.run({
    tenantId: "tenant_alpha",
    action: { name: "echo", risk: "R1" },
    decision,
    plan,
    dryRun: false,
    approval: approval({ expiresAt: "2026-07-15T22:00:00.000Z" }),
  });
  assert.equal(result.state, "review-required");
  assert.equal(calls.length, 0);
});

test("captures runtime failure as auditable result", async () => {
  const { guard } = fixture({ runtimeError: new Error("adapter failed") });
  const result = await guard.run({
    tenantId: "tenant_alpha",
    action: { name: "echo", risk: "R1" },
    decision,
    plan,
  });
  assert.equal(result.state, "failed");
  assert.equal(result.error, "adapter failed");
  assert.equal(result.runtimeCalled, true);
});

test("records an audit entry without approval payload", async () => {
  const records = [];
  const registry = { record(input) { records.push(structuredClone(input)); return input; } };
  const { guard } = fixture({ registry });
  const result = await guard.run({
    tenantId: "tenant_alpha",
    action: { name: "echo", risk: "R1" },
    decision,
    plan,
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].type, "audit");
  assert.equal(records[0].tenantId, "tenant_alpha");
  assert.equal(JSON.stringify(records[0]).includes("approvedBy"), false);
  assert.equal(result.evidence.length, 1);
});

test("blocks secret-like policy input before runtime", async () => {
  const { guard, calls } = fixture();
  const result = await guard.run({
    tenantId: "tenant_alpha",
    action: { name: "configure", risk: "R1", input: { token: "abc" } },
    decision,
    plan,
  });
  assert.equal(result.state, "blocked");
  assert.equal(calls.length, 0);
});

test("returns immutable reports", async () => {
  const { guard } = fixture();
  const result = await guard.run({
    tenantId: "tenant_alpha",
    action: { name: "echo", risk: "R1" },
    decision,
    plan,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.policy), true);
});
