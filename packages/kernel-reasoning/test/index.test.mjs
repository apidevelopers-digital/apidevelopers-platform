import test from "node:test";
import assert from "node:assert/strict";

import { createReasoningEngine } from "../src/index.mjs";

function engine() {
  return createReasoningEngine({
    clock: () => "2026-07-16T12:30:00.000Z",
  });
}

function infer(nodes, relations = []) {
  return engine().infer({ nodes, relations }, { requestedBy: "test" });
}

test("detects active capability without provider", () => {
  const report = infer([
    { id: "capability.publish", kind: "capability", status: "active" },
  ]);

  assert.equal(report.summary.status, "attention");
  assert.equal(report.conclusions[0].ruleId, "RSN-001");
  assert.equal(report.conclusions[0].subject, "capability.publish");
});

test("detects active component without contract", () => {
  const report = infer([
    { id: "component.publisher", kind: "component", status: "active" },
  ]);

  assert.equal(report.conclusions.some((item) => item.ruleId === "RSN-002"), true);
});

test("detects circular dependencies", () => {
  const report = infer(
    [
      { id: "component.a", kind: "component", status: "active" },
      { id: "component.b", kind: "component", status: "active" },
    ],
    [
      { id: "relation.1", type: "depends_on", from: "component.a", to: "component.b" },
      { id: "relation.2", type: "depends_on", from: "component.b", to: "component.a" },
    ],
  );

  const cycle = report.conclusions.find((item) => item.ruleId === "RSN-003");
  assert.ok(cycle);
  assert.deepEqual([...cycle.premises].sort(), ["component.a", "component.a", "component.b"].sort());
});

test("detects active policy without target", () => {
  const report = infer([
    { id: "policy.publish", kind: "policy", status: "active" },
  ]);

  assert.equal(report.conclusions.some((item) => item.ruleId === "RSN-004"), true);
});

test("detects unresolved placeholder", () => {
  const report = infer([
    {
      id: "component.future",
      kind: "component",
      status: "planned",
      metadata: { placeholder: true },
    },
  ]);

  assert.equal(report.conclusions.some((item) => item.ruleId === "RSN-005"), true);
});

test("remains read-only and does not mutate input", () => {
  const snapshot = {
    nodes: [{ id: "capability.publish", kind: "capability", status: "active" }],
    relations: [],
  };
  const before = structuredClone(snapshot);

  const report = engine().infer(snapshot);

  assert.deepEqual(snapshot, before);
  assert.equal(report.mode, "read-only");
  assert.equal(report.mutationAllowed, false);
  assert.equal(report.constraints.automaticDecisionAllowed, false);
  assert.equal(report.constraints.automaticExecutionAllowed, false);
});

test("produces deterministic conclusions for equivalent input", () => {
  const first = infer([
    { id: "capability.publish", kind: "capability", status: "active" },
  ]);
  const second = infer([
    { id: "capability.publish", kind: "capability", status: "active" },
  ]);

  assert.deepEqual(first.conclusions, second.conclusions);
  assert.deepEqual(first.summary, second.summary);
});
