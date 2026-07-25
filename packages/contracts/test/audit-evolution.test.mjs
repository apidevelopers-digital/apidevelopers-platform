import test from "node:test";
import assert from "node:assert/strict";

import {
  assertAuditEvolutionHandoffContract,
  assertGovernedEvolutionReportContract,
  createAuditEvolutionHandoff,
} from "../src/audit-evolution.mjs";
import { createTenantContext } from "../src/tenancy-context.mjs";

function auditReport(overrides = {}) {
  return {
    auditId: "audit.0001",
    generatedAt: "2026-07-19T08:00:00.000Z",
    requestedBy: "principal.auditor",
    scope: "lifecycle",
    tenantId: "tenant_demo_0001",
    cycleId: "cycle.0001",
    sourceHandoffId: "handoff.evidence.audit.0001",
    sourceEvidenceId: "evidence.runtime.0001",
    sourceEvidenceDigest: "a".repeat(64),
    evidenceVerified: true,
    mode: "advisory",
    status: "non-compliant",
    mutationAllowed: false,
    executionAllowed: false,
    subject: { decisionId: "decision.0001" },
    checks: [{
      ruleId: "AUD-004",
      state: "fail",
      subject: "runtime.0001",
      statement: "Runtime ignored a deny policy.",
      recommendation: "Repair policy enforcement.",
      evidence: ["evidence.runtime.0001"],
    }],
    summary: { total: 1, pass: 0, warn: 0, fail: 1, unknown: 0 },
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
    ...overrides,
  };
}

function tenantContext() {
  return createTenantContext({
    tenantId: "tenant_demo_0001",
    principalId: "principal.auditor",
    requestId: "request.evolution.0001",
    roles: ["auditor"],
    permissions: ["read:audit"],
    createdAt: "2026-07-19T08:01:00.000Z",
  });
}

test("creates an immutable audit -> evolution handoff", () => {
  const handoff = createAuditEvolutionHandoff({
    handoffId: "handoff.audit.evolution.0001",
    cycleId: "cycle.0001",
    tenantContext: tenantContext(),
    auditReport: auditReport(),
    createdAt: "2026-07-19T08:02:00.000Z",
  });

  assert.equal(assertAuditEvolutionHandoffContract(handoff), handoff);
  assert.equal(handoff.mutationAllowed, false);
  assert.equal(handoff.approvalAllowed, false);
  assert.equal(handoff.executionAllowed, false);
  assert.equal(handoff.automaticEvolutionAllowed, false);
  assert.equal(handoff.promotionAllowed, false);
  assert.equal(handoff.humanReviewRequired, true);
  assert.ok(Object.isFrozen(handoff));
  assert.ok(Object.isFrozen(handoff.payload.auditReport));
});

test("rejects cross-tenant audit handoffs", () => {
  assert.throws(
    () => createAuditEvolutionHandoff({
      handoffId: "handoff.audit.evolution.0002",
      cycleId: "cycle.0001",
      tenantContext: tenantContext(),
      auditReport: auditReport({ tenantId: "tenant_other_0001" }),
    }),
    /tenantId mismatch/,
  );
});

test("validates a governed evolution report", () => {
  const report = {
    evolutionId: "evolution.20260719080300000",
    generatedAt: "2026-07-19T08:03:00.000Z",
    requestedBy: "principal.auditor",
    scope: "lifecycle",
    tenantId: "tenant_demo_0001",
    cycleId: "cycle.0001",
    sourceHandoffId: "handoff.audit.evolution.0001",
    sourceAuditId: "audit.0001",
    sourceAuditStatus: "non-compliant",
    sourceEvidenceId: "evidence.runtime.0001",
    sourceEvidenceDigest: "a".repeat(64),
    auditVerified: true,
    mode: "advisory",
    status: "changes-proposed",
    proposals: [{
      proposalId: "proposal.001.aud-004.runtime-0001",
      sourceRuleId: "AUD-004",
      subject: "runtime.0001",
      priority: "high",
      action: "remediate",
      title: "Repair policy enforcement.",
      rationale: "Runtime ignored a deny policy.",
      preconditions: ["human-review"],
      evidence: ["evidence.runtime.0001"],
      humanReviewRequired: true,
      mutationAllowed: false,
      approvalAllowed: false,
      executionAllowed: false,
    }],
    summary: { total: 1, high: 1, medium: 0, low: 0 },
    humanReviewRequired: true,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
    automaticEvolutionAllowed: false,
    promotionAllowed: false,
    constraints: {
      mutationAllowed: false,
      executionAllowed: false,
      automaticApprovalAllowed: false,
      humanApprovalRequired: true,
      evidenceRequiredBeforePromotion: true,
      humanReviewRequired: true,
      tenantIsolationRequired: true,
      automaticEvolutionAllowed: false,
      promotionAllowed: false,
      crossTenantAccessAllowed: false,
    },
  };

  assert.equal(assertGovernedEvolutionReportContract(report), report);
});
