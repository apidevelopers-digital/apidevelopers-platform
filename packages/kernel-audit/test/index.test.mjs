import test from "node:test";
import assert from "node:assert/strict";

import {
  AuditEngine,
  auditRules,
  auditStatuses,
  createAuditEngine,
} from "../src/index.mjs";

const clock = () => "2026-07-17T01:00:00.000Z";

function fixtures() {
  const decision = {
    decisionId: "decision.001",
    selectedProposalId: "proposal.001",
    decisionState: "ready-for-human-decision",
    humanApprovalRequired: true,
    approved: false,
    mutationAllowed: false,
    executionAllowed: false,
    constraints: {
      automaticDecisionAllowed: false,
      automaticApprovalAllowed: false,
      automaticExecutionAllowed: false,
    },
  };

  const plan = {
    planId: "plan.001",
    decisionId: "decision.001",
    proposalId: "proposal.001",
    planHash: "hash.001",
    steps: [{ stepId: "step.001", action: "publish" }],
  };

  const policyDecision = {
    policyDecisionId: "policy.001",
    effect: "allow",
    executionAllowed: true,
    mutationAllowed: true,
    planHash: "hash.001",
  };

  const approval = {
    approvalId: "approval.001",
    status: "approved",
    approvedBy: "milena",
    tenantId: "tenant_001",
    decisionId: "decision.001",
    proposalId: "proposal.001",
  };

  const runtimeReport = {
    reportId: "runtime.001",
    decisionId: "decision.001",
    planId: "plan.001",
    proposalId: "proposal.001",
    dryRun: false,
    state: "executed",
    steps: [{ stepId: "step.001", status: "executed" }],
  };

  const evidence = [{
    evidenceId: "evidence.runtime.001",
    status: "active",
    integrity: { algorithm: "sha256", digest: "abc" },
  }];

  return { decision, plan, policyDecision, approval, runtimeReport, evidence };
}

test("exports canonical rules and statuses", () => {
  assert.deepEqual(Object.keys(auditRules), [
    "AUD001",
    "AUD002",
    "AUD003",
    "AUD004",
    "AUD005",
  ]);
  assert.equal(Object.isFrozen(auditRules), true);
  assert.equal(Object.isFrozen(auditStatuses), true);
});

test("factory creates an AuditEngine", () => {
  assert.equal(createAuditEngine({ clock }) instanceof AuditEngine, true);
});

test("rejects invalid constructor options", () => {
  assert.throws(() => new AuditEngine({ clock: null }), /clock must be a function/);
  assert.throws(
    () => new AuditEngine({ verifyEvidence: true }),
    /verifyEvidence must be a function/,
  );
});

test("requires tenant, decision and plan", () => {
  const engine = createAuditEngine({ clock });
  assert.throws(() => engine.audit(), /tenantId must be a non-empty string/);
  assert.throws(
    () => engine.audit({ tenantId: "tenant_001" }),
    /decision must be an object/,
  );
  assert.throws(
    () => engine.audit({ tenantId: "tenant_001", decision: {} }),
    /plan must be an object/,
  );
});

test("returns a compliant immutable advisory audit for a governed execution", () => {
  const engine = createAuditEngine({
    clock,
    verifyEvidence: (record) => record.integrity?.algorithm === "sha256",
  });
  const input = { tenantId: "tenant_001", ...fixtures() };
  const before = structuredClone(input);

  const report = engine.audit(input, {
    requestedBy: "operator",
    scope: "execution",
  });

  assert.deepEqual(input, before);
  assert.equal(report.auditId, "audit.20260717010000000");
  assert.equal(report.status, "compliant");
  assert.equal(report.mode, "advisory");
  assert.equal(report.mutationAllowed, false);
  assert.equal(report.executionAllowed, false);
  assert.equal(report.requestedBy, "operator");
  assert.equal(report.scope, "execution");
  assert.deepEqual(report.summary, {
    total: 5,
    pass: 5,
    warn: 0,
    fail: 0,
    unknown: 0,
  });
  assert.deepEqual(report.evidence, ["evidence.runtime.001"]);
});

test("reports insufficient evidence when approval, runtime and evidence are absent", () => {
  const { decision, plan } = fixtures();
  const report = createAuditEngine({ clock }).audit({
    tenantId: "tenant_001",
    decision,
    plan,
  });

  assert.equal(report.status, "insufficient-evidence");
  assert.equal(report.summary.pass, 2);
  assert.equal(report.summary.unknown, 3);
});

test("fails traceability mismatches", () => {
  const data = fixtures();
  data.plan.decisionId = "decision.other";

  const report = createAuditEngine({ clock }).audit({
    tenantId: "tenant_001",
    ...data,
  });

  assert.equal(report.status, "non-compliant");
  const trace = report.checks.find((item) => item.ruleId === "AUD-001");
  assert.equal(trace.state, "fail");
  assert.match(trace.statement, /plan\.decisionId/);
});

test("fails unsafe decision invariants", () => {
  const data = fixtures();
  data.decision.executionAllowed = true;

  const report = createAuditEngine({ clock }).audit({
    tenantId: "tenant_001",
    ...data,
  });

  assert.equal(report.status, "non-compliant");
  assert.equal(
    report.checks.find((item) => item.ruleId === "AUD-002").state,
    "fail",
  );
});

test("fails replayed approval", () => {
  const data = fixtures();
  data.approval.consumedAt = "2026-07-17T00:59:00.000Z";

  const report = createAuditEngine({ clock }).audit({
    tenantId: "tenant_001",
    ...data,
  });

  assert.equal(report.status, "non-compliant");
  assert.equal(
    report.checks.find((item) => item.ruleId === "AUD-003").state,
    "fail",
  );
});

test("accepts a coherent dry-run preview without execution approval", () => {
  const data = fixtures();
  data.approval = null;
  data.policyDecision = null;
  data.runtimeReport = {
    reportId: "runtime.preview.001",
    decisionId: "decision.001",
    planId: "plan.001",
    proposalId: "proposal.001",
    dryRun: true,
    state: "previewed",
    steps: [{ stepId: "step.001", status: "previewed" }],
  };

  const report = createAuditEngine({
    clock,
    verifyEvidence: () => true,
  }).audit({
    tenantId: "tenant_001",
    ...data,
  });

  assert.equal(report.status, "insufficient-evidence");
  assert.equal(
    report.checks.find((item) => item.ruleId === "AUD-004").state,
    "pass",
  );
});

test("fails invalid evidence integrity", () => {
  const data = fixtures();
  const report = createAuditEngine({
    clock,
    verifyEvidence: () => false,
  }).audit({
    tenantId: "tenant_001",
    ...data,
  });

  assert.equal(report.status, "non-compliant");
  assert.equal(
    report.checks.find((item) => item.ruleId === "AUD-005").state,
    "fail",
  );
});
