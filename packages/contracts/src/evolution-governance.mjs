import { assertGovernedAuditReportContract } from "./evidence-audit.mjs";
import { assertGovernedEvolutionReportContract } from "./audit-evolution.mjs";
import { assertTenantContextContract } from "./tenancy-context.mjs";

const VERSION = 1;
const HEX_256 = /^[a-f0-9]{64}$/;

function obj(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}
function str(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}
function must(value, expected, name) {
  if (value !== expected) throw new Error(`${name} must be ${expected}`);
}
function clone(value) {
  return value == null ? value : structuredClone(value);
}
function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function assertLifecycle(lifecycle, evolutionReport, name) {
  obj(lifecycle, name);
  const { decisionId, proposalId, constitutionDecision, policyDecision, approval, auditReport } = lifecycle;
  str(decisionId, `${name}.decisionId`);
  str(proposalId, `${name}.proposalId`);
  obj(constitutionDecision, `${name}.constitutionDecision`);
  obj(policyDecision, `${name}.policyDecision`);
  obj(approval, `${name}.approval`);
  assertGovernedAuditReportContract(auditReport, `${name}.auditReport`);

  for (const [field, value] of [
    ["constitutionDecision.tenantId", constitutionDecision.tenantId],
    ["constitutionDecision.decisionId", constitutionDecision.decisionId],
    ["policyDecision.tenantId", policyDecision.tenantId],
    ["policyDecision.decisionId", policyDecision.decisionId],
    ["approval.approvalId", approval.approvalId],
    ["approval.approvedBy", approval.approvedBy],
    ["approval.tenantId", approval.tenantId],
    ["approval.decisionId", approval.decisionId],
    ["approval.proposalId", approval.proposalId],
  ]) str(value, `${name}.${field}`);

  if (constitutionDecision.decisionId !== decisionId) throw new Error(`${name} constitution decision mismatch`);
  if (policyDecision.decisionId !== decisionId) throw new Error(`${name} policy decision mismatch`);
  if (approval.decisionId !== decisionId) throw new Error(`${name} approval decision mismatch`);
  if (approval.proposalId !== proposalId) throw new Error(`${name} approval proposal mismatch`);
  if (approval.status !== "approved") throw new Error(`${name}.approval.status must be approved`);
  if (approval.consumedAt != null || approval.used === true || approval.replayed === true) {
    throw new Error(`${name} approval must be fresh and not replayed`);
  }
  if (evolutionReport.sourceAuditId !== auditReport.auditId) throw new Error(`${name} audit lineage mismatch`);
  if (evolutionReport.sourceEvidenceId !== auditReport.sourceEvidenceId) throw new Error(`${name} evidence lineage mismatch`);
  if (evolutionReport.sourceEvidenceDigest !== auditReport.sourceEvidenceDigest) throw new Error(`${name} evidence digest mismatch`);
  return lifecycle;
}

export const evolutionGovernanceContractVersion = VERSION;

export function assertEvolutionGovernanceHandoffContract(handoff, name = "evolutionGovernanceHandoff") {
  obj(handoff, name);
  must(handoff.schemaVersion, VERSION, `${name}.schemaVersion`);
  if (handoff.from !== "kernel-evolution" || handoff.to !== "kernel-governance") {
    throw new Error(`${name} must route kernel-evolution -> kernel-governance`);
  }
  for (const field of ["handoffId", "cycleId", "createdAt"]) str(handoff[field], `${name}.${field}`);
  assertTenantContextContract(handoff.tenantContext, `${name}.tenantContext`);
  obj(handoff.payload, `${name}.payload`);
  assertGovernedEvolutionReportContract(handoff.payload.evolutionReport, `${name}.payload.evolutionReport`);
  assertLifecycle(handoff.payload.lifecycle, handoff.payload.evolutionReport, `${name}.payload.lifecycle`);

  const report = handoff.payload.evolutionReport;
  const lifecycle = handoff.payload.lifecycle;
  if (report.tenantId !== handoff.tenantContext.tenantId) throw new Error(`${name} tenantId mismatch`);
  if (report.cycleId !== handoff.cycleId) throw new Error(`${name} cycleId mismatch`);
  for (const [label, tenantId] of [
    ["audit", lifecycle.auditReport.tenantId],
    ["constitution", lifecycle.constitutionDecision.tenantId],
    ["policy", lifecycle.policyDecision.tenantId],
    ["approval", lifecycle.approval.tenantId],
  ]) {
    if (tenantId !== handoff.tenantContext.tenantId) throw new Error(`${name} ${label} tenantId mismatch`);
  }
  for (const field of ["mutationAllowed", "approvalAllowed", "executionAllowed", "automaticGovernanceAllowed", "promotionAllowed"]) {
    must(handoff[field], false, `${name}.${field}`);
  }
  must(handoff.humanDecisionRequired, true, `${name}.humanDecisionRequired`);
  return handoff;
}

export function createEvolutionGovernanceHandoff({
  handoffId,
  cycleId,
  tenantContext,
  evolutionReport,
  lifecycle,
  createdAt = new Date().toISOString(),
} = {}) {
  const handoff = {
    schemaVersion: VERSION,
    handoffId,
    from: "kernel-evolution",
    to: "kernel-governance",
    cycleId,
    tenantContext: clone(tenantContext),
    payload: { evolutionReport: clone(evolutionReport), lifecycle: clone(lifecycle) },
    createdAt,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
    automaticGovernanceAllowed: false,
    promotionAllowed: false,
    humanDecisionRequired: true,
  };
  assertEvolutionGovernanceHandoffContract(handoff);
  return freeze(handoff);
}

export function assertGovernedGovernanceReportContract(report, name = "governedGovernanceReport") {
  obj(report, name);
  for (const field of [
    "governanceReviewId", "generatedAt", "requestedBy", "scope", "tenantId", "cycleId",
    "sourceHandoffId", "sourceEvolutionId", "sourceAuditId", "sourceEvidenceId",
    "sourceEvidenceDigest", "decisionId", "proposalId",
  ]) str(report[field], `${name}.${field}`);
  if (!HEX_256.test(report.sourceEvidenceDigest)) throw new Error(`${name}.sourceEvidenceDigest must be sha256`);
  if (report.mode !== "advisory-governance-review") throw new Error(`${name}.mode is invalid`);
  if (!["ready-for-human-decision", "needs-review", "needs-evidence", "blocked"].includes(report.status)) {
    throw new Error(`${name}.status is invalid`);
  }
  if (!["authorized", "needs-review", "needs-evidence", "blocked"].includes(report.engineStatus)) {
    throw new Error(`${name}.engineStatus is invalid`);
  }
  if (typeof report.engineAuthorized !== "boolean") throw new TypeError(`${name}.engineAuthorized must be boolean`);
  must(report.humanDecisionRequired, true, `${name}.humanDecisionRequired`);
  for (const field of ["authorized", "mutationAllowed", "approvalAllowed", "executionAllowed", "automaticGovernanceAllowed", "promotionAllowed"]) {
    must(report[field], false, `${name}.${field}`);
  }
  if (!Array.isArray(report.checks) || report.checks.length === 0) throw new TypeError(`${name}.checks must be non-empty`);
  obj(report.summary, `${name}.summary`);
  const total = report.summary.pass + report.summary.review + report.summary.fail + report.summary.unknown;
  if (report.summary.total !== total || total !== report.checks.length) throw new Error(`${name}.summary is inconsistent`);
  obj(report.constraints, `${name}.constraints`);
  for (const field of ["humanDecisionRequired", "explicitApprovalRequired", "denyByDefault", "tenantIsolationRequired", "evidenceIntegrityRequired", "traceabilityRequired"]) {
    must(report.constraints[field], true, `${name}.constraints.${field}`);
  }
  for (const field of ["mutationAllowed", "executionAllowed", "automaticApprovalAllowed", "automaticGovernanceAllowed", "promotionAllowed", "crossTenantAccessAllowed"]) {
    must(report.constraints[field], false, `${name}.constraints.${field}`);
  }
  return report;
}
