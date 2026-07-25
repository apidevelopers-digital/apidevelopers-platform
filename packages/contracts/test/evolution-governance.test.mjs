import test from "node:test";
import assert from "node:assert/strict";

import { assertGovernedGovernanceReportContract } from "../src/evolution-governance.mjs";

test("requires a human decision before governance can authorize promotion", () => {
  const report = {
    governanceReviewId: "governance.0001",
    generatedAt: "2026-07-25T12:20:00.000Z",
    requestedBy: "principal.governor",
    scope: "tenant",
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
    engineStatus: "needs-review",
    engineAuthorized: false,
    humanDecisionRequired: true,
    authorized: false,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
    automaticGovernanceAllowed: false,
    promotionAllowed: false,
    checks: [{ ruleId: "governance.human-decision", status: "review" }],
    summary: { total: 1, pass: 0, review: 1, fail: 0, unknown: 0 },
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
