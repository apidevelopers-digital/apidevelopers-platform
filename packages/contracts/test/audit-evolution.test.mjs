import test from "node:test";
import assert from "node:assert/strict";

import { assertGovernedEvolutionReportContract } from "../src/audit-evolution.mjs";

test("keeps evolution advisory and subject to human review", () => {
  const report = {
    evolutionId: "evolution.0001",
    generatedAt: "2026-07-25T12:10:00.000Z",
    requestedBy: "principal.reviewer",
    scope: "tenant",
    tenantId: "tenant_demo_0001",
    cycleId: "cycle.0001",
    sourceHandoffId: "handoff.audit.evolution.0001",
    sourceAuditId: "audit.0001",
    sourceAuditStatus: "compliant",
    sourceEvidenceId: "evidence.runtime.0001",
    sourceEvidenceDigest: "a".repeat(64),
    mode: "advisory",
    status: "stable",
    auditVerified: true,
    humanReviewRequired: true,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
    automaticEvolutionAllowed: false,
    promotionAllowed: false,
    proposals: [],
    summary: { total: 0, high: 0, medium: 0, low: 0 },
    constraints: {
      humanApprovalRequired: true,
      humanReviewRequired: true,
      evidenceRequiredBeforePromotion: true,
      tenantIsolationRequired: true,
      mutationAllowed: false,
      executionAllowed: false,
      automaticApprovalAllowed: false,
      automaticEvolutionAllowed: false,
      promotionAllowed: false,
      crossTenantAccessAllowed: false,
    },
  };

  assert.equal(assertGovernedEvolutionReportContract(report), report);
});
