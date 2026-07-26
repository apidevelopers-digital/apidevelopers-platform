import test from "node:test";
import assert from "node:assert/strict";
import {
  EvolutionEngine,
  createEvolutionEngine,
  evolutionActions,
  evolutionStatuses,
} from "../src/index.mjs";

const NOW = "2026-07-26T07:00:00.000Z";
const clock = () => NOW;

function audit(overrides = {}) {
  return {
    auditId: "audit.001",
    status: "compliant",
    checks: [],
    ...overrides,
  };
}

test("exports canonical statuses and actions", () => {
  assert.deepEqual(evolutionStatuses, ["stable", "changes-proposed", "blocked-by-evidence"]);
  assert.deepEqual(evolutionActions, ["review", "collect-evidence", "remediate"]);
  assert.equal(Object.isFrozen(evolutionStatuses), true);
  assert.equal(Object.isFrozen(evolutionActions), true);
});

test("factory creates an EvolutionEngine", () => {
  assert.equal(createEvolutionEngine({ clock }) instanceof EvolutionEngine, true);
});

test("requires a governed audit report", () => {
  const engine = createEvolutionEngine({ clock });
  assert.throws(() => engine.propose(), /auditReport must be an object/);
  assert.throws(() => engine.propose({}), /auditReport.auditId/);
  assert.throws(() => engine.propose({ auditId: "audit.001" }), /checks must be an array/);
});

test("returns stable advisory output for compliant audit", () => {
  const result = createEvolutionEngine({ clock }).propose(audit(), {
    requestedBy: "operator",
    scope: "platform",
  });
  assert.equal(result.status, "stable");
  assert.equal(result.mode, "advisory");
  assert.deepEqual(result.proposals, []);
  assert.deepEqual(result.summary, { total: 0, high: 0, medium: 0, low: 0 });
  assert.equal(result.constraints.mutationAllowed, false);
  assert.equal(result.constraints.executionAllowed, false);
  assert.equal(Object.isFrozen(result), true);
});

test("turns failures into high-priority remediation proposals", () => {
  const result = createEvolutionEngine({ clock }).propose(audit({
    status: "non-compliant",
    checks: [{
      ruleId: "AUD-004",
      state: "fail",
      subject: "runtime.001",
      statement: "Runtime ignored policy.",
      recommendation: "Repair policy enforcement.",
      evidence: ["evidence.002", "evidence.001", "evidence.001"],
    }],
  }));
  assert.equal(result.status, "changes-proposed");
  assert.equal(result.proposals[0].priority, "high");
  assert.equal(result.proposals[0].action, "remediate");
  assert.deepEqual(result.proposals[0].evidence, ["evidence.001", "evidence.002"]);
  assert.equal(result.proposals[0].humanReviewRequired, true);
  assert.equal(result.proposals[0].executionAllowed, false);
});

test("blocks promotion when evidence is unknown", () => {
  const result = createEvolutionEngine({ clock }).propose(audit({
    status: "insufficient-evidence",
    checks: [{
      ruleId: "AUD-005",
      state: "unknown",
      subject: "plan.001",
      statement: "No evidence supplied.",
    }],
  }));
  assert.equal(result.status, "blocked-by-evidence");
  assert.equal(result.proposals[0].priority, "medium");
  assert.equal(result.proposals[0].action, "collect-evidence");
  assert.deepEqual(result.proposals[0].preconditions, [
    "attach-verifiable-evidence",
    "human-review",
  ]);
});

test("orders proposals deterministically and does not mutate the audit", () => {
  const input = audit({
    checks: [
      { ruleId: "AUD-005", state: "unknown", subject: "z" },
      { ruleId: "AUD-001", state: "fail", subject: "b" },
      { ruleId: "AUD-001", state: "warn", subject: "a" },
    ],
  });
  const before = structuredClone(input);
  const result = createEvolutionEngine({ clock }).propose(input);
  assert.deepEqual(
    result.proposals.map((item) => [item.sourceRuleId, item.subject]),
    [["AUD-001", "a"], ["AUD-001", "b"], ["AUD-005", "z"]],
  );
  assert.deepEqual(input, before);
});
