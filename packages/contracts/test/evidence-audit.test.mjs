import test from "node:test";
import assert from "node:assert/strict";

import {
  assertEvidenceAuditHandoffContract,
  assertGovernedAuditReportContract,
  createEvidenceAuditHandoff,
} from "../src/evidence-audit.mjs";
import { createTenantContext } from "../src/tenancy-context.mjs";

function fixtures() {
  const tenantContext = createTenantContext({
    tenantId: "tenant_demo_0001",
    principalId: "principal.operator",
    requestId: "request.audit.0001",
    roles: ["auditor"],
    permissions: ["read:audit"],
    createdAt: "2026-07-19T07:00:00.000Z",
  });

  const decision = {
    decisionId: "decision.0001",
    selectedProposalId: "proposal.0001",
  };

  const plan = {
    planId: "plan.0001",
    decisionId: decision.decisionId,
    proposalId: decision.selectedProposalId,
    planHash: "planhash.0001",
    steps: [{ stepId: "step.0001", action: "echo" }],
  };

  const policyDecision = {
    policyDecisionId: "policy.0001",
    effect: "allow",
    executionAllowed: false,
    mutationAllowed: false,
    planHash: plan.planHash,
  };

  const runtimeReport = {
    reportId: "runtime.0001",
    planId: plan.planId,
    decisionId: decision.decisionId,
    proposalId: plan.proposalId,
    tenantId: tenantContext.tenantId,
    cycleId: "cycle.0001",
    sourceHandoffId: "handoff.policy.runtime.0001",
    policyDecisionId: policyDecision.policyDecisionId,
    approvalId: null,
    requestedMode: "preview",
    dryRun: true,
    state: "previewed",
    startedAt: "2026-07-19T07:01:00.000Z",
    endedAt: "2026-07-19T07:01:01.000Z",
    executionAuthorized: false,
    executionObserved: false,
    mutationObserved: false,
    steps: [{
      stepId: "step.0001",
      action: "echo",
      status: "previewed",
      risk: "R1",
      output: { planned: true },
    }],
    evidence: [{
      evidenceId: "runtime-step.0001",
      stepId: "step.0001",
      status: "previewed",
    }],
    constraints: {
      policyGateRequired: true,
      explicitConfirmationRequired: true,
      automaticExecutionAllowed: false,
      tenantIsolationRequired: true,
      evidenceRequired: true,
    },
  };

  const evidenceRecord = {
    evidenceId: "evidence.runtime.0001",
    tenantId: tenantContext.tenantId,
    type: "runtime-report",
    source: {
      component: "kernel-runtime",
      reportId: runtimeReport.reportId,
      policyDecisionId: runtimeReport.policyDecisionId,
      handoffId: runtimeReport.sourceHandoffId,
    },
    payload: { runtimeReport },
    status: "active",
    createdAt: "2026-07-19T07:02:00.000Z",
    correlationId: runtimeReport.cycleId,
    metadata: {
      immutable: true,
      redacted: true,
      schemaVersion: 1,
    },
    integrity: {
      algorithm: "sha256",
      digest: "a".repeat(64),
    },
  };

  return {
    tenantContext,
    lifecycle: { decision, plan, policyDecision, approval: null },
    evidenceRecord,
  };
}

test("creates an immutable evidence -> audit handoff", () => {
  const data = fixtures();
  const handoff = createEvidenceAuditHandoff({
    handoffId: "handoff.evidence.audit.0001",
    cycleId: "cycle.0001",
    tenantContext: data.tenantContext,
    evidenceRecord: data.evidenceRecord,
    lifecycle: data.lifecycle,
    createdAt: "2026-07-19T07:03:00.000Z",
  });

  assert.equal(assertEvidenceAuditHandoffContract(handoff), handoff);
  assert.equal(handoff.mutationAllowed, false);
  assert.equal(handoff.approvalAllowed, false);
  assert.equal(handoff.executionAllowed, false);
  assert.ok(Object.isFrozen(handoff));
  assert.ok(Object.isFrozen(handoff.payload.evidenceRecord));
});

test("rejects cross-tenant evidence", () => {
  const data = fixtures();
  assert.throws(
    () => createEvidenceAuditHandoff({
      handoffId: "handoff.evidence.audit.0002",
      cycleId: "cycle.0001",
      tenantContext: data.tenantContext,
      evidenceRecord: { ...data.evidenceRecord, tenantId: "tenant_other_0001" },
      lifecycle: data.lifecycle,
    }),
    /tenantId mismatch/,
  );
});

test("rejects approval carried by preview evidence", () => {
  const data = fixtures();
  assert.throws(
    () => createEvidenceAuditHandoff({
      handoffId: "handoff.evidence.audit.0003",
      cycleId: "cycle.0001",
      tenantContext: data.tenantContext,
      evidenceRecord: data.evidenceRecord,
      lifecycle: {
        ...data.lifecycle,
        approval: {
          approvalId: "approval.0001",
          approvedBy: "human.operator",
          tenantId: data.tenantContext.tenantId,
          decisionId: data.lifecycle.decision.decisionId,
          proposalId: data.lifecycle.plan.proposalId,
          planHash: data.lifecycle.plan.planHash,
          status: "approved",
          consumedAt: null,
          used: false,
        },
      },
    }),
    /preview must not carry approval/,
  );
});

test("validates a governed audit report", () => {
  const report = {
    auditId: "audit.0001",
    generatedAt: "2026-07-19T07:04:00.000Z",
    requestedBy: "principal.operator",
    scope: "lifecycle",
    tenantId: "tenant_demo_0001",
    cycleId: "cycle.0001",
    sourceHandoffId: "handoff.evidence.audit.0001",
    sourceEvidenceId: "evidence.runtime.0001",
    sourceEvidenceDigest: "a".repeat(64),
    evidenceVerified: true,
    mode: "advisory",
    status: "compliant",
    mutationAllowed: false,
    executionAllowed: false,
    subject: { decisionId: "decision.0001" },
    checks: [{ ruleId: "AUD-001", state: "pass" }],
    summary: { total: 1, pass: 1, warn: 0, fail: 0, unknown: 0 },
    evidence: ["evidence.runtime.0001"],
    constraints: {
      automaticApprovalAllowed: false,
      automaticExecutionAllowed: false,
      humanAuthorityRequired: true,
      traceabilityRequired: true,
      evidenceIntegrityRequired: true,
      tenantIsolationRequired: true,
      crossTenantAccessAllowed: false,
    },
  };

  assert.equal(assertGovernedAuditReportContract(report), report);
});
