import {
  assertEvidenceAuditHandoffContract,
  assertGovernedAuditReportContract,
} from "@apidevelopers/contracts";
import { verifyEvidence } from "@apidevelopers/kernel-evidence";
import { createAuditEngine } from "./index.mjs";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function runGovernedAudit({
  handoff,
  engine = createAuditEngine(),
} = {}) {
  assertEvidenceAuditHandoffContract(handoff);

  const { evidenceRecord, lifecycle } = handoff.payload;
  if (!verifyEvidence(evidenceRecord)) {
    throw new Error("source evidence integrity verification failed");
  }

  const rawReport = engine.audit({
    tenantId: evidenceRecord.tenantId,
    cycleId: handoff.cycleId,
    decision: lifecycle.decision,
    planRecord: lifecycle.plan,
    policyDecision: lifecycle.policyDecision,
    runtimeReport: evidenceRecord.payload.runtimeReport,
    evidence: [evidenceRecord],
    approval: lifecycle.approval ?? null,
  });

  const report = deepFreeze({
    ...rawReport,
    cycleId: handoff.cycleId,
    sourceHandoffId: handoff.handoffId,
    sourceEvidenceId: evidenceRecord.evidenceId,
    sourceEvidenceDigest: evidenceRecord.integrity.digest,
    evidenceVerified: true,
    mutationAllowed: false,
    executionAllowed: false,
    constraints: {
      ...rawReport.constraints,
      evidenceIntegrityRequired: true,
      tenantIsolationRequired: true,
      crossTenantAccessAllowed: false,
    },
  });

  assertGovernedAuditReportContract(report);
  return report;
}
