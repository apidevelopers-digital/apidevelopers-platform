import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const namespaceRoot = path.join(repositoryRoot, "node_modules", "@apidevelopers");
mkdirSync(namespaceRoot, { recursive: true });

for (const packageName of ["contracts", "kernel-evolution"]) {
  const linkPath = path.join(namespaceRoot, packageName);
  if (!existsSync(linkPath)) {
    symlinkSync(
      path.join(repositoryRoot, "packages", packageName),
      linkPath,
      "dir",
    );
  }
}

const {
  assertGovernedEvolutionReportContract,
  createAuditEvolutionHandoff,
  createTenantContext,
} = await import("@apidevelopers/contracts");
const {
  createEvolutionEngine,
} = await import("@apidevelopers/kernel-evolution");
const {
  runGovernedEvolution,
} = await import("@apidevelopers/kernel-evolution/governed");

test("turns a governed audit report into advisory evolution proposals", () => {
  const tenantContext = createTenantContext({
    tenantId: "tenant_demo_0001",
    principalId: "principal.auditor",
    requestId: "request.pipeline.evolution.0001",
    roles: ["auditor"],
    permissions: ["read:audit"],
    createdAt: "2026-07-19T08:10:00.000Z",
  });

  const auditReport = {
    auditId: "audit.0001",
    generatedAt: "2026-07-19T08:11:00.000Z",
    requestedBy: "principal.auditor",
    scope: "lifecycle",
    tenantId: tenantContext.tenantId,
    cycleId: "cycle.0001",
    sourceHandoffId: "handoff.evidence.audit.0001",
    sourceEvidenceId: "evidence.runtime.0001",
    sourceEvidenceDigest: "b".repeat(64),
    evidenceVerified: true,
    mode: "advisory",
    status: "non-compliant",
    mutationAllowed: false,
    executionAllowed: false,
    subject: { runtimeReportId: "runtime.0001" },
    checks: [{
      ruleId: "AUD-004",
      state: "fail",
      subject: "runtime.0001",
      statement: "Runtime ignored a deny policy.",
      recommendation: "Block runtime and repair policy enforcement.",
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
  };

  const handoff = createAuditEvolutionHandoff({
    handoffId: "handoff.audit.evolution.0001",
    cycleId: auditReport.cycleId,
    tenantContext,
    auditReport,
    createdAt: "2026-07-19T08:12:00.000Z",
  });

  const report = runGovernedEvolution({
    handoff,
    engine: createEvolutionEngine({
      clock: () => "2026-07-19T08:13:00.000Z",
    }),
  });

  assert.equal(assertGovernedEvolutionReportContract(report), report);
  assert.equal(report.status, "changes-proposed");
  assert.equal(report.tenantId, tenantContext.tenantId);
  assert.equal(report.cycleId, auditReport.cycleId);
  assert.equal(report.sourceAuditId, auditReport.auditId);
  assert.equal(report.sourceEvidenceDigest, auditReport.sourceEvidenceDigest);
  assert.equal(report.auditVerified, true);
  assert.deepEqual(report.summary, { total: 1, high: 1, medium: 0, low: 0 });
  assert.equal(report.proposals[0].action, "remediate");
  assert.equal(report.proposals[0].humanReviewRequired, true);
  assert.equal(report.proposals[0].mutationAllowed, false);
  assert.equal(report.proposals[0].approvalAllowed, false);
  assert.equal(report.proposals[0].executionAllowed, false);
  assert.equal(report.automaticEvolutionAllowed, false);
  assert.equal(report.promotionAllowed, false);
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.proposals));
});
