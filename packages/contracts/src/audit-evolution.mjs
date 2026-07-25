import { assertGovernedAuditReportContract } from "./evidence-audit.mjs";
import { assertTenantContextContract } from "./tenancy-context.mjs";

const VERSION = 1;
const HEX_256 = /^[a-f0-9]{64}$/;

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function string(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function falseOnly(value, name) {
  if (value !== false) throw new Error(`${name} must be false`);
}

function trueOnly(value, name) {
  if (value !== true) throw new Error(`${name} must be true`);
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export const auditEvolutionContractVersion = VERSION;

export function assertAuditEvolutionHandoffContract(
  handoff,
  name = "auditEvolutionHandoff",
) {
  object(handoff, name);
  if (handoff.schemaVersion !== VERSION) {
    throw new Error(`${name}.schemaVersion must be ${VERSION}`);
  }
  if (handoff.from !== "kernel-audit" || handoff.to !== "kernel-evolution") {
    throw new Error(`${name} must route kernel-audit -> kernel-evolution`);
  }

  for (const field of ["handoffId", "cycleId", "createdAt"]) {
    string(handoff[field], `${name}.${field}`);
  }

  assertTenantContextContract(handoff.tenantContext, `${name}.tenantContext`);
  object(handoff.payload, `${name}.payload`);
  assertGovernedAuditReportContract(
    handoff.payload.auditReport,
    `${name}.payload.auditReport`,
  );

  const report = handoff.payload.auditReport;
  if (report.tenantId !== handoff.tenantContext.tenantId) {
    throw new Error(`${name} tenantId mismatch`);
  }
  if (report.cycleId !== handoff.cycleId) {
    throw new Error(`${name} cycleId mismatch`);
  }

  falseOnly(handoff.mutationAllowed, `${name}.mutationAllowed`);
  falseOnly(handoff.approvalAllowed, `${name}.approvalAllowed`);
  falseOnly(handoff.executionAllowed, `${name}.executionAllowed`);
  falseOnly(handoff.automaticEvolutionAllowed, `${name}.automaticEvolutionAllowed`);
  falseOnly(handoff.promotionAllowed, `${name}.promotionAllowed`);
  trueOnly(handoff.humanReviewRequired, `${name}.humanReviewRequired`);

  return handoff;
}

export function createAuditEvolutionHandoff({
  handoffId,
  cycleId,
  tenantContext,
  auditReport,
  createdAt = new Date().toISOString(),
} = {}) {
  const handoff = {
    schemaVersion: VERSION,
    handoffId,
    from: "kernel-audit",
    to: "kernel-evolution",
    cycleId,
    tenantContext: clone(tenantContext),
    payload: {
      auditReport: clone(auditReport),
    },
    createdAt,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
    automaticEvolutionAllowed: false,
    promotionAllowed: false,
    humanReviewRequired: true,
  };

  assertAuditEvolutionHandoffContract(handoff);
  return deepFreeze(handoff);
}

export function assertGovernedEvolutionReportContract(
  report,
  name = "governedEvolutionReport",
) {
  object(report, name);

  for (const field of [
    "evolutionId",
    "generatedAt",
    "requestedBy",
    "scope",
    "tenantId",
    "cycleId",
    "sourceHandoffId",
    "sourceAuditId",
    "sourceAuditStatus",
    "sourceEvidenceId",
    "sourceEvidenceDigest",
  ]) {
    string(report[field], `${name}.${field}`);
  }

  if (!HEX_256.test(report.sourceEvidenceDigest)) {
    throw new Error(`${name}.sourceEvidenceDigest must be a sha256 hex digest`);
  }
  if (report.mode !== "advisory") {
    throw new Error(`${name}.mode must be advisory`);
  }
  if (!["stable", "changes-proposed", "blocked-by-evidence"].includes(report.status)) {
    throw new Error(`${name}.status is invalid`);
  }

  trueOnly(report.auditVerified, `${name}.auditVerified`);
  trueOnly(report.humanReviewRequired, `${name}.humanReviewRequired`);
  falseOnly(report.mutationAllowed, `${name}.mutationAllowed`);
  falseOnly(report.approvalAllowed, `${name}.approvalAllowed`);
  falseOnly(report.executionAllowed, `${name}.executionAllowed`);
  falseOnly(report.automaticEvolutionAllowed, `${name}.automaticEvolutionAllowed`);
  falseOnly(report.promotionAllowed, `${name}.promotionAllowed`);

  if (!Array.isArray(report.proposals)) {
    throw new TypeError(`${name}.proposals must be an array`);
  }

  for (const [index, proposal] of report.proposals.entries()) {
    const proposalName = `${name}.proposals[${index}]`;
    object(proposal, proposalName);
    for (const field of [
      "proposalId",
      "sourceRuleId",
      "subject",
      "priority",
      "action",
      "title",
      "rationale",
    ]) {
      string(proposal[field], `${proposalName}.${field}`);
    }
    if (!["high", "medium", "low"].includes(proposal.priority)) {
      throw new Error(`${proposalName}.priority is invalid`);
    }
    if (!["review", "collect-evidence", "remediate"].includes(proposal.action)) {
      throw new Error(`${proposalName}.action is invalid`);
    }
    if (!Array.isArray(proposal.preconditions) || !Array.isArray(proposal.evidence)) {
      throw new TypeError(`${proposalName} preconditions and evidence must be arrays`);
    }
    trueOnly(proposal.humanReviewRequired, `${proposalName}.humanReviewRequired`);
    falseOnly(proposal.mutationAllowed, `${proposalName}.mutationAllowed`);
    falseOnly(proposal.approvalAllowed, `${proposalName}.approvalAllowed`);
    falseOnly(proposal.executionAllowed, `${proposalName}.executionAllowed`);
  }

  object(report.summary, `${name}.summary`);
  for (const field of ["total", "high", "medium", "low"]) {
    if (!Number.isInteger(report.summary[field]) || report.summary[field] < 0) {
      throw new TypeError(`${name}.summary.${field} must be a non-negative integer`);
    }
  }
  if (
    report.summary.total !== report.proposals.length ||
    report.summary.total !==
      report.summary.high + report.summary.medium + report.summary.low
  ) {
    throw new Error(`${name}.summary is inconsistent`);
  }

  object(report.constraints, `${name}.constraints`);
  for (const field of [
    "humanApprovalRequired",
    "humanReviewRequired",
    "evidenceRequiredBeforePromotion",
    "tenantIsolationRequired",
  ]) {
    trueOnly(report.constraints[field], `${name}.constraints.${field}`);
  }
  for (const field of [
    "mutationAllowed",
    "executionAllowed",
    "automaticApprovalAllowed",
    "automaticEvolutionAllowed",
    "promotionAllowed",
    "crossTenantAccessAllowed",
  ]) {
    falseOnly(report.constraints[field], `${name}.constraints.${field}`);
  }

  return report;
}
