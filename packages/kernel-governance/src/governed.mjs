import {
  assertEvolutionGovernanceHandoffContract,
  assertGovernedGovernanceReportContract,
} from "@apidevelopers/contracts";
import { createGovernanceEngine } from "./index.mjs";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function mapStatus(status) {
  if (status === "authorized") return "ready-for-human-decision";
  return status;
}

export function runGovernedGovernance({
  handoff,
  engine = createGovernanceEngine(),
} = {}) {
  assertEvolutionGovernanceHandoffContract(handoff);

  const { evolutionReport, lifecycle } = handoff.payload;
  const raw = engine.evaluate(
    {
      tenantId: handoff.tenantContext.tenantId,
      decisionId: lifecycle.decisionId,
      proposalId: lifecycle.proposalId,
      constitutionDecision: lifecycle.constitutionDecision,
      policyDecision: lifecycle.policyDecision,
      approval: lifecycle.approval,
      auditReport: lifecycle.auditReport,
      evolutionReport,
    },
    {
      requestedBy: handoff.tenantContext.principalId,
      scope: "governance-review",
    },
  );

  const report = deepFreeze({
    governanceReviewId: `governance-review.${raw.governanceId}`,
    generatedAt: raw.generatedAt,
    requestedBy: raw.requestedBy,
    scope: raw.scope,
    tenantId: raw.tenantId,
    cycleId: handoff.cycleId,
    sourceHandoffId: handoff.handoffId,
    sourceEvolutionId: evolutionReport.evolutionId,
    sourceAuditId: evolutionReport.sourceAuditId,
    sourceEvidenceId: evolutionReport.sourceEvidenceId,
    sourceEvidenceDigest: evolutionReport.sourceEvidenceDigest,
    decisionId: raw.decisionId,
    proposalId: raw.proposalId,
    mode: "advisory-governance-review",
    status: mapStatus(raw.status),
    engineStatus: raw.status,
    engineAuthorized: raw.authorized,
    humanDecisionRequired: true,
    authorized: false,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
    automaticGovernanceAllowed: false,
    promotionAllowed: false,
    checks: structuredClone(raw.checks),
    summary: structuredClone(raw.summary),
    references: structuredClone(raw.references),
    constraints: {
      denyByDefault: true,
      humanDecisionRequired: true,
      explicitApprovalRequired: true,
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
  });

  assertGovernedGovernanceReportContract(report);
  return report;
}
