import test from "node:test";
import assert from "node:assert/strict";

import {
  EvolutionEngine,
  createEvolutionEngine,
  evolutionActions,
  evolutionStatuses,
} from "../src/index.mjs";

const clock = () => "2026-07-17T02:00:00.000Z";

function audit(overrides = {}) {
  return {
    auditId: "audit.001",
    status: "compliant",
    checks: [],
    ...overrides,
  };
}

test("exports canonical statuses and actions", () => {
  assert.deepEqual(evolutionStatuses, [
    "stable",
    "changes-proposed",
    "blocked-by-evidence",
  ]);
  assert.deepEqual(evolutionActions, [
    "review",
    "collect-evidence",
    "remediate",
  ]);
  assert.equal(Object.isFrozen(evolutionStatuses), true);
  assert.equal(Object.isFrozen(evolutionActions), true);
});

test("factory creates an EvolutionEngine", () => {
  assert.equal(createEvolutionEngine({ clock }) instanceof EvolutionEngine, true);
});

test("rejects invalid constructor options", () => {
  assert.throws(() => new EvolutionEngine({ clock: null }), /clock must be a function/);
});

test("requires a governed audit report", () => {
  const engine = createEvolutionEngine({ clock });
  assert.throws(() => engine.propose(), /auditReport must be an object/);
  assert.throws(() => engine.propose({}), /auditReport.auditId must be a non-empty string/);
  assert.throws(
    () => engine.propose({ auditId: "audit.001" }),
    /auditReport.checks must be an array/,
  );
});

test("returns a stable advisory result for a compliant audit", () => {
  const result = createEvolutionEngine({ clock }).propose(audit(), {
    requestedBy: "operator",
    scope: "platform",
  });

  assert.equal(result.evolutionId, "evolution.20260717020000000");
  assert.equal(result.sourceAuditId, "audit.001");
  assert.equal(result.status, "stable");
  assert.equal(result.mode, "advisory");
  assert.deepEqual(result.proposals, []);
  assert.deepEqual(result.summary, { total: 0, high: 0, medium: 0, low: 0 });
  assert.deepEqual(result.constraints, {
    mutationAllowed: false,
    executionAllowed: false,
    automaticApprovalAllowed: false,
    humanApprovalRequired: true,
    evidenceRequiredBeforePromotion: true,
  });
});

test("turns failed audit checks into high-priority remediation proposals", () => {
  const result = createEvolutionEngine({ clock }).propose(audit({
    status: "non-compliant",
    checks: [{
      ruleId: "AUD-004",
      state: "fail",
      subject: "runtime.001",
      statement: "Runtime ignored a deny policy.",
      recommendation: "Block runtime and repair policy enforcement.",
      evidence: ["evidence.002", "evidence.001", "evidence.001"],
    }],
  }));

  assert.equal(result.status, "changes-proposed");
  assert.equal(result.proposals[0].priority, "high");
  assert.equal(result.proposals[0].action, "remediate");
  assert.deepEqual(result.proposals[0].preconditions, ["human-review"]);
  assert.deepEqual(result.proposals[0].evidence, ["evidence.001", "evidence.002"]);
  assert.equal(result.proposals[0].mutationAllowed, false);
  assert.equal(result.proposals[0].executionAlowed, false);
});

test("blocks promotion when audit evidence is unknown", () => {
  const result = createEvolutionEngine({ clock }).propose(audit({
    status: "insufficient-evidence",
    checks: [{
      ruleId: "AUD-005",
      state: "unknown",
      subject: "plan.001",
      statement: "No evidence was supplied.",
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

test("turns warnings into low-priority review proposals", () => {
  const result = createEvolutionEngine({ clock }).propose(audit({
    status: "attention",
    checks: [{
      ruleId: "AUD-003",
      state: "warn",
      subject: "approval.001",
      statement: "Approval expires soon.",
    }],
  }));

  assert.equal(result.status, "changes-proposed");
  assert.equal(result.proposals[0].priority, "low");
  assert.equal(result.proposals[0].action, "review");
});

test("orders proposals deterministically", () => {
  const checks = [
    { ruleId: "AUD-005", state: "unknown", subject: "z" },
    { ruleId: "AUD-001", state: "fail", subject: "b" },
    { ruleId: "AUD-001", state: "warn", subject: "a" },
  ];

  const result = createEvolutionEngine({ clock }).propose(audit({ checks }));

  assert.deepEqual(
    result.proposals.map((item) => [item.sourceRuleId, item.subject]),
    [
      ["AUD-001", "a"],
      ["AUD-001", "b"],
      ["AUD-005", "z"],
    ],
  );
});

test("does not mutate the audit report", () => {
  const input = audit({
    status: "non-compliant",
    checks: [{
      ruleId: "AUD-002",
      state: "fail",
      subject: "decision.001",
      evidence: ["evidence.001"],
    }],
  });
  const before = structuredClone(input);

  createEvolutionEngine({ clock }).propose(input);

  assert.deepEqual(input, before);
});

test("rejects invalid audit check states", () => {
  const engine = createEvolutionEngine({ clock });
  assert.throws(
    () => engine.propose(audit({
      checks: [{ ruleId: "AUD-001", state: "executed" }],
    })),
    /state is invalid/,
  );
});
