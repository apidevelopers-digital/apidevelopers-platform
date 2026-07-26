import test from "node:test";
import assert from "node:assert/strict";

import {
  AuditEngine,
  auditRules,
  auditStatuses,
  createAuditEngine,
} from "../src/index.mjs";

const NOW = "2026-07-26T06:00:00.000Z";
const clock = () => NOW;

function fixtures() {
  const decision = {
    decisionId: "decision.1",
    selectedProposalId: "proposal.1",
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
    planId: "plan.1",
    decisionId: "decision.1",
    proposalId: "proposal.1",
    planHash: "a".repeat(64),
    steps: [{ stepId: "step.1", action: "preview" }],
  };

  const policyDecision = {
    policyDecisionId: "policy.1",
    tenantId: "tenant_alpha",
    cycleId: "cycle_1",
    planHash: "a".repeat(64),
    effect: "preview",
    executionAllowed: false,
    mutationAllowed: false,
  };

  const runtimeReport = {
    reportId: "runtime.1",
    planId: "plan.1",
    decisionId: "decision.1",
    proposalId: "proposal.1",
    tenantId: "tenant_alpha",
    cycleId: "cycle_1",
    sourceHandoffId: "handoff.policy-runtime.1",
    policyDecisionId: "policy.1",
    requestedMode: "preview",
    state: "previewed",
    startedAt: NOW,
    endedAt: NOW,
    dryRun: true,
    executionAuthorized: false,
    executionObserved: false,
    mutationObserved: false,
    approvalId: null,
    steps: [{ stepId: "step.1", status: "previewed" }],
    evidence: ["runtime.preview.1"],
    constraints: {
      policyGateRequired: true,
      explicitConfirmationRequired: true,
      tenantIsolationRequired: true,
      evidenceRequired: true,
      automaticExecutionAllowed: false,
    },
  };

  const evidence = [{
    schemaVersion: 2,
    evidenceId: "evidence.runtime.1",
    tenantId: "tenant_alpha",
    cycleId: "cycle_1",
    type: "runtime-report",
    source: {
      component: "kernel-runtime",
      reportId: "runtime.1",
      policyDecisionId: "policy.1",
      handoffId: "handoff.policy-runtime.1",
    },
    payload: { runtimeReport },
    status: "active",
    createdAt: NOW,
    expiresAt: null,
    correlationId: "cycle_1",
    previousDigest: null,
    metadata: { immutable: true, redacted: true, schemaVersion: 2 },
    integrity: { algorithm: "sha256", digest: "b".repeat(64) },
  }];

  return { decision, plan, policyDecision, runtimeReport, evidence };
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

test("factory creates an AuditEngine and validates options", () => {
  assert.equal(createAuditEngine({ clock }) instanceof AuditEngine, true);
  assert.throws(() => new AuditEngine({ clock: null }), /clock must be a function/);
  assert.throws(
    () => new AuditEngine({ verifyEvidence: true }),
    /verifyEvidence must be a function/,
  );
});

test("requires tenant, cycle, decision and plan", () => {
  const engine = createAuditEngine({ clock });
  assert.throws(() => engine.audit(), /tenantId must be a non-empty string/);
  assert.throws(
    () => engine.audit({ tenantId: "tenant_alpha" }),
    /cycleId must be a non-empty string/,
  );
  assert.throws(
    () => engine.audit({ tenantId: "tenant_alpha", cycleId: "cycle_1" }),
    /decision must be an object/,
  );
});

test("returns a compliant immutable advisory audit for a governed preview", () => {
  const engine = createAuditEngine({
    clock,
    verifyEvidence: (record) => record.integrity?.digest === "b".repeat(64),
  });
  const data = fixtures();
  const before = structuredClone(data);

  const report = engine.audit(
    {
      tenantId: "tenant_alpha",
      cycleId: "cycle_1",
      ...data,
    },
    { requestedBy: "operator", scope: "preview" },
  );

  assert.deepEqual(data, before);
  assert.equal(report.auditId, "audit.20260726060000000");
  assert.equal(report.status, "compliant");
  assert.equal(report.mode, "advisory");
  assert.equal(report.mutationAllowed, false);
  assert.equal(report.executionAllowed, false);
  assert.equal(report.summary.pass, 5);
  assert.deepEqual(report.evidence, ["evidence.runtime.1"]);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.checks), true);
  assert.equal(Object.isFrozen(report.constraints), true);
});

test("fails lifecycle mismatches", () => {
  const data = fixtures();
  data.plan.decisionId = "decision.other";

  const report = createAuditEngine({
    clock,
    verifyEvidence: () => true,
  }).audit({
    tenantId: "tenant_alpha",
    cycleId: "cycle_1",
    ...data,
  });

  assert.equal(report.status, "non-compliant");
  const trace = report.checks.find((item) => item.ruleId === "AUD-001");
  assert.equal(trace.state, "fail");
  assert.match(trace.statement, /plan\.decisionId/);
});

test("fails cross-tenant and cross-cycle evidence", () => {
  const data = fixtures();
  data.evidence[0].tenantId = "tenant_beta";
  data.evidence[0].cycleId = "cycle_2";

  const report = createAuditEngine({
    clock,
    verifyEvidence: () => true,
  }).audit({
    tenantId: "tenant_alpha",
    cycleId: "cycle_1",
    ...data,
  });

  assert.equal(report.status, "non-compliant");
  assert.equal(
    report.checks.find((item) => item.ruleId === "AUD-005").state,
    "fail",
  );
});

test("fails invalid evidence integrity", () => {
  const data = fixtures();
  const report = createAuditEngine({
    clock,
    verifyEvidence: () => false,
  }).audit({
    tenantId: "tenant_alpha",
    cycleId: "cycle_1",
    ...data,
  });

  assert.equal(report.status, "non-compliant");
  assert.equal(
    report.checks.find((item) => item.ruleId === "AUD-005").state,
    "fail",
  );
});

test("fails a replayed execution approval", () => {
  const data = fixtures();
  data.policyDecision.effect = "allow";
  data.policyDecision.executionAllowed = true;
  data.policyDecision.mutationAllowed = true;
  data.runtimeReport.requestedMode = "execute";
  data.runtimeReport.state = "executed";
  data.runtimeReport.dryRun = false;
  data.runtimeReport.executionAuthorized = true;
  data.runtimeReport.executionObserved = true;
  data.runtimeReport.mutationObserved = true;
  data.runtimeReport.approvalId = "approval.1";
  data.runtimeReport.steps = [{ stepId: "step.1", status: "executed" }];
  const approval = {
    approvalId: "approval.1",
    status: "approved",
    approvedBy: "human.1",
    tenantId: "tenant_alpha",
    cycleId: "cycle_1",
    decisionId: "decision.1",
    proposalId: "proposal.1",
    planHash: "a".repeat(64),
    consumedAt: NOW,
  };

  const report = createAuditEngine({
    clock,
    verifyEvidence: () => true,
  }).audit({
    tenantId: "tenant_alpha",
    cycleId: "cycle_1",
    ...data,
    approval,
  });

  assert.equal(report.status, "non-compliant");
  assert.equal(
    report.checks.find((item) => item.ruleId === "AUD-003").state,
    "fail",
  );
});
