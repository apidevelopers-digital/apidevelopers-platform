import test from "node:test";
import assert from "node:assert/strict";

import { assertGovernedAuditReportContract } from "../src/evidence-audit.mjs";

test("validates an immutable governed audit report bound to runtime evidence", () => {
  const report = {
    auditId: "audit.0001",
    generatedAt: "2026-07-25T12:00:00.000Z",
    requestedBy: "principal.auditor",
    scope: "tenant",
    tenantId: "tenant_demo_0001",
    cycleId: "cycle.0001",
    sourceHandoffId: "handoff.evidence.audit.0001",
    sourceEvidenceId: "evidence.runtime.0001",
    sourceEvidenceDigest: "a".repeat(64),
    mode: "advisory",
    status: "compliant",
    evidenceVerified: true,
    mutationAllowed: false,
    executionAllowed: false,
    subject: { component: "kernel-runtime", package: "contracts" },
    checks: [{ ruleId: "audit.runtime.integrity", status: "pass" }],
    summary: { total: 1, pass: 1, warn: 0, fail: 0, unknown: 0 },
    evidence: ["evidence.runtime.0001"],
    constraints: {
      humanAuthorityRequired: true,
      traceabilityRequired: true,
      evidenceIntegrityRequired: true,
      tenantIsolationRequired: true,
      automaticApprovalAllowed: false,
      automaticExecutionAllowed: false,
      crossTenantAccessAllowed: false,
    },
  };

  assert.equal(assertGovernedAuditReportContract(report), report);
});
