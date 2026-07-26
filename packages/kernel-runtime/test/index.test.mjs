import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeEngine, runtimeModes, runtimeStatuses } from "../src/index.mjs";

const clock = () => "2026-07-26T09:00:00.000Z";
const request = () => ({
  tenantId: "tenant_001",
  cycleId: "cycle.001",
  decisionId: "decision.001",
  proposalId: "proposal.001",
  action: "echo",
  payload: { message: "ok", apiKey: "secret-value" },
});
const approval = () => ({
  approvalId: "approval.001",
  status: "approved",
  approvedBy: "igor",
  tenantId: "tenant_001",
  cycleId: "cycle.001",
  decisionId: "decision.001",
  proposalId: "proposal.001",
  action: "echo",
});

test("exports canonical modes and statuses", () => {
  assert.deepEqual(runtimeModes, ["preview", "execute"]);
  assert.deepEqual(runtimeStatuses, ["previewed", "executed", "blocked", "failed"]);
});

test("previews by default without invoking adapter", async () => {
  let calls = 0;
  const engine = createRuntimeEngine({ clock, actions: { echo: async () => { calls += 1; } } });
  const report = await engine.run(request());
  assert.equal(report.status, "previewed");
  assert.equal(report.executed, false);
  assert.equal(calls, 0);
  assert.equal(report.request.payload.apiKey, "[REDACTED]");
});

test("blocks execution without fresh approval", async () => {
  const engine = createRuntimeEngine({ clock, actions: { echo: async () => ({ ok: true }) } });
  assert.equal((await engine.run(request(), { mode: "execute", confirmation: "EXECUTE_APPROVED_ACTION" })).reason, "fresh-human-approval-required");
  assert.equal((await engine.run(request(), { mode: "execute", approval: { ...approval(), consumedAt: clock() }, confirmation: "EXECUTE_APPROVED_ACTION" })).reason, "approval-replay-blocked");
});

test("blocks mismatched approval and missing confirmation", async () => {
  const engine = createRuntimeEngine({ clock, actions: { echo: async () => ({ ok: true }) } });
  assert.equal((await engine.run(request(), { mode: "execute", approval: { ...approval(), tenantId: "tenant_other" }, confirmation: "EXECUTE_APPROVED_ACTION" })).reason, "approval-tenantId-mismatch");
  assert.equal((await engine.run(request(), { mode: "execute", approval: approval() })).reason, "explicit-confirmation-required");
});

test("executes only a registered action with bound approval and confirmation", async () => {
  const engine = createRuntimeEngine({
    clock,
    actions: { echo: async (payload) => ({ echoed: payload.message, password: "hidden" }) },
  });
  const input = request();
  const before = structuredClone(input);
  const report = await engine.run(input, {
    mode: "execute",
    approval: approval(),
    confirmation: "EXECUTE_APPROVED_ACTION",
  });
  assert.equal(report.status, "executed");
  assert.equal(report.executed, true);
  assert.equal(report.result.echoed, "ok");
  assert.equal(report.result.password, "[REDACTED]");
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(report), true);
});

test("rejects unknown actions", async () => {
  const engine = createRuntimeEngine({ clock });
  await assert.rejects(() => engine.run(request()), /unregistered runtime action/);
});
