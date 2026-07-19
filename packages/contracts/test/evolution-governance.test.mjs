
import test from "node:test";
import assert from "node:assert/strict";

import {
  assertEvolutionGovernanceHandoffContract,
  assertGovernedGovernanceReportContract,
  createEvolutionGovernanceHandoff,
} from "../src/evolution-governance.mjs";
import { createTenantContext } from "../src/tenancy-context.mjs";

function auditReport(overrides = {}) {
  return {
    auditId: "audit.0001",
    generatedAt: "2026-07-19T09:00:00.000Z",
    requestedBy: "principal.auditor",
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
    ...overrides,
  };
}

function evolutionReport(overrides = {}) {
  return {
    evolutionId: "evolution.0001",
    generatedAt: "2026-07-19T09:01:00.000Z",
    requestedBy: "principal.auditor",
    scope: "lifecycle",
    tenantId: "tenant_demo_0001",
    cycleId: "cycle.0001",
    sourceHandoffId: "handoff.audit.evolution.0001",
    sourceAuditId: "audit.0001",
    sourceAuditStatus: "compliant",
    sourceEvidenceId: "evidence.runtime.0001",
    sourceEvidenceDigest: "a".repeat(64),
    auditVerified: true,
    mode: "advisory",
    status: "stable",
    proposals: [],
    summary: { total: 0, high: 0, medium: 0, low: 0 },
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
    ...overrides,
  };
}

function lifecycle() {
  return {
    decisionId: "decision.0001",
    proposalId: "proposal.0001",
    constitutionDecision: {
      constitutionDecisionId: "constitution.0001",
      tenantId: "tenant_demo_0001",
      decisionId: "decision.0001",
      effect: "allow",
    },
    policyDecision: {
      policyDecisionId: "policy.0001",
      tenantId: "tenant_demo_0001",
      decisionId: "decision.0001",
      effect: "allow",
    },
    approval: {
      approvalId: "approval.0001",
      approvedBy: "human.operator",
      tenantId: "tenant_demo_0001",
      decisionId: "decision.0001",
      proposalId: "proposal.0001",
      status: "approved",
      consumedAt: null,
      used: false,
      replayed: false,
    },
    auditReport: auditReport(),
  };
}

function tenantContext() {
  return createTenantContext({
    tenantId: "tenant_demo_0001",
    principalId: "principal.governance",
    requestId: "request.governance.0001",
    roles: ["governance-reviewer"],
    permissions: ["read:evolution", "review:governance"],
    createdAt: "2026-07-19T09:02:00.000Z",
  });
}

test("creates an immutable evolution -> governance handoff", () => {
  const handoff = createEvolutionGovernanceHandoff({
    handoffId: "handoff.evolution.governance.0001",
    cycleId: "cycle.0001",
    tenantContext: tenantContext(),
    evolutionReport: evolutionReport(),
    lifecycle: lifecycle(),
    createdAt: "2026-07-19T09:03:00.000Z",
  });

  assert.equal(assertEvolutionGovernanceHandoffContract(handoff), handoff);
  assert.equal(handoff.mutationAllowed, false);
  assert.equal(handoff.approvalAllowed, false);
  assert.equal(handoff.executionAllowed, false);
  assert.equal(handoff.automaticGovernanceAllowed, false);
  assert.equal(handoff.promotionAllowed, false);
  assert.equal(handoff.humanDecisionRequired, true);
  assert.ok(Object.isFrozen(handoff));
  assert.ok(Object.isFrozen(handoff.payload.evolutionReport));
});

test("rejects cross-tenant evolution handoffs", () => {
  assert.throws(
    () => createEvolutionGovernanceHandoff({
      handoffId: "handoff.evolution.governance.0002",
      cycleId: "cycle.0001",
      tenantContext: tenantContext(),
      evolutionReport: evolutionReport({ tenantId: "tenant_other_0001" }),
      lifecycle: lifecycle(),
    }),
    /tenantId mismatch/,
  );
});

test("rejects replayed approvals before governance review", () => {
  const data = lifecycle();
  data.approval.replayed = true;
  assert.throws(
    () => createEvolutionGovernanceHandoff({
      handoffId: "handoff.evolution.governance.0003",
      cycleId: "cycle.0001",
      tenantContext: tenantContext(),
      evolutionReport: evolutionReport(),
      lifecycle: data,
    }),
    /fresh and not replayed/,
  );
});

test("validates a governed governance review report", () => {
  const report = {
    governanceReviewId: "governance-review.0001",
    generatedAt: "2026-07-19T09:04:00.000Z",
    requestedBy: "principal.governance",
    scope: "governance-review",
    tenantId: "tenant_demo_0001",
    cycleId: "cycle.0001",
    sourceHandoffId: "handoff.evolution.governance.0001",
    sourceEvolutionId: "evolution.0001",
    sourceAuditId: "audit.0001",
    sourceEvidenceId: "evidence.runtime.0001",
    sourceEvidenceDigest: "a".repeat(64),
    decisionId: "decision.0001",
    proposalId: "proposal.0001",
    mode: "advisory-governance-review",
    status: "ready-for-human-decision",
    engineStatus: "authorized",
    engineAuthorized: true,
    humanDecisionRequired: true,
    authorized: false,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
    automaticGovernanceAllowed: false,
    promotionAllowed: false,
    checks: [{ ruleId: "GOV-001", state: "pass" }],
    summary: { total: 1, pass: 1, review: 0, fail: 0, unknown: 0 },
    references: { evolutionId: "evolution.0001" },
    constraints: {
      humanDecisionRequired: true,
      explicitApprovalRequired: true,
      denyByDefault: true,
      tenantIsolationRequired: true,
      evidenceIntegrityRequired: true,
      traceabilityRequired: true,
      mutationAllowed: false,
      executionAllowed: false,
      automaticApprovalAllowed: false,
      automaticGovernanceAllowed: false,
      promotionAllowed: false,
      crossTenantAccessAllowed: false,
    },
  };

  assert.equal(assertGovernedGovernanceReportContract(report), report);
});
