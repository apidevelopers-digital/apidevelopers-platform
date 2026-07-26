import test from "node:test";
import assert from "node:assert/strict";

import {
  GovernanceEngine,
  createGovernanceEngine,
  governanceRules,
  governanceStatuses,
} from "../src/index.mjs";

const clock = () => "2026-07-17T03:00:00.000Z";

function bundle(overrides = {}) {
  return {
    tenantId: "tenant_001",
    decisionId: "decision.001",
    proposalId: "proposal.001",
    constitutionDecision: {
      constitutionDecisionId: "constitution.001",
      tenantId: "tenant_001",
      decisionId: "decision.001",
      effect: "allow",
    },
    policyDecision: {
      policyDecisionId: "policy.001",
      tenantId: "tenant_001",
      decisionId: "decision.001",
      effect: "allow",
    },
    approval: {
      approvalId: "approval.001",
      tenantId: "tenant_001",
      decisionId: "decision.001",
      proposalId: "proposal.001",
      status: "approved",
      approvedBy: "milena",
    },
    auditReport: {
      auditId: "audit.001",
      tenantId: "tenant_001",
      status: "compliant",
      subject: { decisionId: "decision.001" },
      evidence: ["evidence.001"],
    },
    evolutionReport: {
      evolutionId: "evolution.001",
      sourceAuditId: "audit.001",
      status: "stable",
    },
    ...overrides,
  };
}

test("exports canonical rules and statuses", () => {
  assert.deepEqual(Object.keys(governanceRules), ["GOV001", "GOV002", "GOV003", "GOV004", "GOV005"]);
  assert.deepEqual(governanceStatuses, ["authorized", "needs-review", "needs-evidence", "blocked"]);
  assert.equal(Object.isFrozen(governanceRules), true);
  assert.equal(Object.isFrozen(governanceStatuses), true);
});

test("factory creates a GovernanceEngine", () => {
  assert.equal(createGovernanceEngine({ clock }) instanceof GovernanceEngine, true);
});

test("rejects invalid constructor options", () => {
  assert.throws(() => new GovernanceEngine({ clock: null }), /clock must be a function/);
});

test("requires tenant, decision and proposal identifiers", () => {
  const engine = createGovernanceEngine({ clock });
  assert.throws(() => engine.evaluate(), /tenantId must be a non-empty string/);
  assert.throws(() => engine.evaluate({ tenantId: "t" }), /decisionId must be a non-empty string/);
  assert.throws(() => engine.evaluate({ tenantId: "t", decisionId: "d" }), /proposalId must be a non-empty string/);
});

test("authorizes a fully governed bundle without executing", () => {
  const report = createGovernanceEngine({ clock }).evaluate(bundle(), {
    requestedBy: "operator",
    scope: "release-candidate",
  });

  assert.equal(report.governanceId, "governance.20260717030000000");
  assert.equal(report.status, "authorized");
  assert.equal(report.authorized, true);
  assert.equal(report.mode, "authorization-validation");
  assert.equal(report.mutationAllowed, false);
  assert.equal(report.executionAllowed, false);
  assert.deepEqual(report.summary, { total: 5, pass: 5, review: 0, fail: 0, unknown: 0 });
  assert.equal(report.constraints.executionGatewayRequired, true);
});

test("blocks a constitutional denial", () => {
  const data = bundle();
  data.constitutionDecision.effect = "deny";
  const report = createGovernanceEngine({ clock }).evaluate(data);
  assert.equal(report.status, "blocked");
  assert.equal(report.authorized, false);
  assert.equal(report.checks.find((item) => item.ruleId === "GOV-001").state, "fail");
});

test("blocks a policy denial", () => {
  const data = bundle();
  data.policyDecision.effect = "deny";
  const report = createGovernanceEngine({ clock }).evaluate(data);
  assert.equal(report.status, "blocked");
  assert.equal(report.checks.find((item) => item.ruleId === "GOV-002").state, "fail");
});

test("requires fresh explicit human approval", () => {
  const report = createGovernanceEngine({ clock }).evaluate(bundle({ approval: null }));
  assert.equal(report.status, "needs-evidence");
  assert.equal(report.checks.find((item) => item.ruleId === "GOV-003").state, "unknown");

  const replayed = bundle();
  replayed.approval.consumedAt = "2026-07-17T02:00:00.000Z";
  const replayedReport = createGovernanceEngine({ clock }).evaluate(replayed);
  assert.equal(replayedReport.status, "blocked");
  assert.equal(replayedReport.checks.find((item) => item.ruleId === "GOV-003").state, "fail");
});

test("maps audit evidence states", () => {
  const missing = createGovernanceEngine({ clock }).evaluate(bundle({ auditReport: null }));
  assert.equal(missing.status, "needs-evidence");
  assert.equal(missing.checks.find((item) => item.ruleId === "GOV-004").state, "unknown");

  const data = bundle();
  data.auditReport.status = "attention";
  const review = createGovernanceEngine({ clock }).evaluate(data);
  assert.equal(review.status, "needs-review");
  assert.equal(review.checks.find((item) => item.ruleId === "GOV-004").state, "review");
});

test("requires stable evolution before authorization", () => {
  const data = bundle();
  data.evolutionReport.status = "changes-proposed";
  const review = createGovernanceEngine({ clock }).evaluate(data);
  assert.equal(review.status, "needs-review");

  data.evolutionReport.status = "blocked-by-evidence";
  const evidence = createGovernanceEngine({ clock }).evaluate(data);
  assert.equal(evidence.status, "needs-evidence");
});

test("blocks lifecycle identifier mismatches", () => {
  const data = bundle();
  data.approval.proposalId = "proposal.other";
  data.evolutionReport.sourceAuditId = "audit.other";
  const report = createGovernanceEngine({ clock }).evaluate(data);
  const binding = report.checks.find((item) => item.ruleId === "GOV-005");
  assert.equal(report.status, "blocked");
  assert.equal(binding.state, "fail");
  assert.match(binding.statement, /approval\.proposalId/);
  assert.match(binding.statement, /evolutionReport\.sourceAuditId/);
});

test("does not mutate the governed bundle", () => {
  const input = bundle();
  const before = structuredClone(input);
  createGovernanceEngine({ clock }).evaluate(input);
  assert.deepEqual(input, before);
});
