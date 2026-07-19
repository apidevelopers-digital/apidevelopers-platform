import { assertGovernedAuditReportContract } from "./evidence-audit.mjs";
import { assertGovernedEvolutionReportContract } from "./audit-evolution.mjs";
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

function assertLifecycle(lifecycle, evolutionReport, name) {
  object(lifecycle, name);
  const {
    decisionId,
    proposalId,
    constitutionDecision,
    policyDecision,
    approval,
    auditReport,
  } = lifecycle;

  string(decisionId, `${name}.decisionId`);
  string(proposalId, `${name}.proposalId`);
  object(constitutionDecision, `${name}.constitutionDecision`);
  object(policyDecision, `${name}.policyDecision`);
  object(approval, `${name}.approval`);
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
  ]) {
    string(value, `${name}.${field}`);
  }

  if (constitutionDecision.decisionId !== decisionId) {
    throw new Error(`${name} constitution decision mismatch`);
  }
  if (policyDecision.decisionId !== decisionId) {
    throw new Error(`${name} policy decision mismatch`);
  }
  if (approval.decisionId !== decisionId) {
    throw new Error(`${name} approval decision mismatch`);
  }
  if (approval.proposalId !== proposalId) {
    throw new Error(`${name} approval proposal mismatch`);
  }
  if (approval.status !== "approved") {
    throw new Error(`${name}.approval.status must be approved`);
  }
  if (approval.consumedAt != null || approval.used === true || approval.replayed === true) {
    throw new Error(`${name} approval must be fresh and not replayed`);
  }
  if (evolutionReport.sourceAuditId !== auditReport.auditId) {
    throw new Error(`${name} audit lineage mismatch`);
  }
  if (evolutionReport.sourceEvidenceId !== auditReport.sourceEvidenceId) {
    throw new Error(`${name} evidence lineage mismatch`);
  }
  if (evolutionReport.sourceEvidenceDigest !== auditReport.sourceEvidenceDigest) {
    throw new Error(`${name} evidence digest mismatch`);
  }

  return lifecycle;
}

export const evolutionGovernanceContractVersion = VERSION;

export function assertEvolutionGovernanceHandoffContract(
  handoff,
  name = "evolutionGovernanceHandoff",
) {
  object(handoff, name);
  if (handoff.schemaVersion !== VERSION) {
    throw new Error(`${name}.schemaVersion must be ${VERSION}`);
  }
  if (handoff.from !== "kernel-evolution" || handoff.to !== "kernel-governance") {
    throw new Error(`${name} must route kernel-evolution -> kernel-governance`);
  }

  for (const field of ["handoffId", "cycleId", "createdAt"]) {
    string(handoff[field], `${name}.${field}`);
  }
  assertTenantContextContract(handoff.tenantContext, `${name}.tenantContext`);
  object(handoff.payload, `${name}.payload`);
  assertGovernedEvolutionReportContract(
    handoff.payload.evolutionReport,
    `${name}.payload.evolutionReport`,
  );
  assertLifecycle(
    handoff.payload.lifecycle,
    handoff.payload.evolutionReport,
    `${name}.payload.lifecycle`,
  );

  const report = handoff.payload.evolutionReport;
  const lifecycle = handoff.payload.lifecycle;
  if (report.tenantId !== handoff.tenantContext.tenantId) {
    throw new Error(`${name} tenantId mismatch`);
  }
  if (report.cycleId !== handoff.cycleId) {
    throw new Error(`${name} cycleId mismatch`);
  }
  if (lifecycle.auditReport.tenantId !== handoff.tenantContext.tenantId) {
    throw new Error(`${name} audit tenantId mismatch`);
  }
  if (lifecycle.auditReport.cycleId !== handoff.cycleId) {
    throw new Error(`${name} audit cycleId mismatch`);
  }
  if (lifecycle.constitutionDecision.tenantId !== handoff.tenantContext.tenantId) {
    throw new Error `${name} constitution tenantId mismatch`);
  }
  if (lifecycle.policyDecision.tenantId !== handoff.tenantContext.tenantId) {
    throw new Error(`${name} policy tenantId mismatch`);
  }
  if (lifecycle.approval.tenantId !== handoff.tenantContext.tenantId) {
    throw new Error(`${name} approval tenantId mismatch`);
  }

  for (const field of [
    "mutationAllowed",
    "approvalAllowed",
    "executionAllowed",
    "automaticGovernanceAllowed",
    "promotionAllowed",
  ]) {
    falseOnly(handoff[field], `${name}.${field}`);
  }
  trueOnly(handoff.humanDecisionRequired, `${name}.humanDecisionRequired`);

  return handoff;
}

export function createEvolutionGovernanceHandoff({
  handoffId,
  cycleId,
  tenantContext,
  evolutionEport,
  lifecycle,
  createdAt = new Date().toISOString(),
} = {}) {
  const handoff = {
    schemaVersion: VERSION,,
    handoffId,
    from: "kernel-evolution",
    to: "kernel-governance",
    cycleId,
    tenantContext: clone(tenantContext),
    payload: {
      evolutionReport: clone(evolutionReport),
      lifecycle: clone(lifecycle),
    },
    createdAt,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
    automaticGovernanceAllowed: false,
    promotionAllowed: false,
    humanDecisionRequired: true,
  };

  assertEvolutionGovernanceHandoffContract(handoff);
  return deepFreeze(handoff);
}

export function assertGovernedGovernanceReportContract(
  report,
  name = "governedGovernanceReport",
) {
  object(report, name);

  for (const field of [
    "governanceReviewId",
    "generatedAt",
    "requestedBy",
    "scope",
    "tenantId",
    "cycleId",
    "sourceHandoffId",
    "sourceEvolutionId",
    "sourceAuditId",
    "sourceEvidenceId",
    "sourceEvidenceDigest",
    "decisionId",
    "proposalId",
  ]) {
    string(report[field], `${name}.${field}`);
  }

  if (!HEX_256.test(report.sourceEvidenceDigest)) {
    throw new Error(`${name}.sourceEvidenceDigest must be a sha256 hex digest`);
  }
  if (report.mode !== "advisory-governance-review") {
    throw new Error(`${name}.mode must be advisory-governance-review`);
  }
  if (!["ready-for-human-decision", "needs-review", "needs-evidence", "blocked"].includes(report.status)) {
    throw new Error `${name}.status is invalid`);
  }
  if (!["authorized", "needs-review", "needs-evidence", "blocked"].includes(report.engineStatus)) {
    throw new Error(`${name}.engineStatus is invalid`);
  }
  if (typeof report.engineAuthorized !== "boolean") {
    throw new TypeError(`${name}.engineAuthorized must be boolean`);
  }

  trueOnly(report.humanDecisionRequired, `${name}.humanDecisionRequired`);
  falseOnly(report.authorized, `${name}.authorized`);
  falseOnly(report.mutationAllowed, `${name}.mutationAllowed`);
  falseOnly(report.approvalAllowed, `${name}.approvalAllowed`);
  falseOnly(report.executionAllowed, `${name}.executionAllowed`);
  falseOnly(report.automaticGovernanceAllowed, `${name}.automaticGovernanceAllowed`);
  falseOnly(report.promotionAllowed, `${name}.promotionAllowed`);

  if (!Array.isArray(report.checks) || report.checks.length === 0) {
    throw new TypeError `${name}.checks must be a non-empty array`);
  }
  object(report.summary, `${name}.summary`);
  const total =
    report.summary.pass +
    report.summary.review +
    report.summary.fail +
    report.summary.unknown;
  if (report.summary.total !== total || report.summary.total !== report.checks.length) {
    throw new Error `${name}.summary is inconsistent`);
  }

  object(report.constraints, `${name}.constraints`);
  for (const field of [
    "humanDecisionRequired",
    "explicitApprovalRequired",
    "denyByDefault",
    "tenantIsolationRequired",
    "evidenceIntegrityRequired",
    "traceabilityRequired",
  ]) {
    trueOnly(report.constraints[field], `${name}.constraints.${field}`);
  }
  for (const field of [
    "mutationAllowed",
    "executionAllowed",
    "automaticApprovalAllowed",
    "automaticGovernanceAllowed",
    "promotionAllowed",
    "crossTenantAccessAllowed",
  ]) {
    falseOnly(report.constraints[field], `${name}.constraints.${field}`);
  }

  return report;
}
