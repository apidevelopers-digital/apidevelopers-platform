import {
  assertAuditEvolutionHandoffContract,
  assertGovernedEvolutionReportContract,
} from "@apidevelopers/contracts";
import { createEvolutionEngine } from "./index.mjs";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function runGovernedEvolution({
  handoff,
  engine = createEvolutionEngine(),
} = {}) {
  assertAuditEvolutionHandoffContract(handoff);

  const auditReport = handoff.payload.auditReport;
  const raw = engine.propose(auditReport, {
    requestedBy: handoff.tenantContext.principalId,
    scope: "lifecycle",
  });

  const proposals = raw.proposals.map((proposal) => ({
    ...proposal,
    humanReviewRequired: true,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
  }));

  const report = deepFreeze({
    ...raw,
    proposals,
    tenantId: handoff.tenantContext.tenantId,
    cycleId: handoff.cycleId,
    sourceHandoffId: handoff.handoffId,
    sourceAuditId: auditReport.auditId,
    sourceAuditStatus: auditReport.status,
    sourceEvidenceId: auditReport.sourceEvidenceId,
    sourceEvidenceDigest: auditReport.sourceEvidenceDigest,
    auditVerified: true,
    humanReviewRequired: true,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
    automaticEvolutionAllowed: false,
    promotionAllowed: false,
    constraints: {
      ...raw.constraints,
      humanReviewRequired: true,
      tenantIsolationRequired: true,
      automaticEvolutionAllowed: false,
      promotionAllowed: false,
      crossTenantAccessAllowed: false,
    },
  });

  assertGovernedEvolutionReportContract(report);
  return report;
}
