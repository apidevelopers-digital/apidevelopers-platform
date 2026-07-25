import { assertRuntimeEvidenceRecordContract } from "./runtime-evidence.mjs";
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

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertLifecycleContext(context, evidenceRecord, name) {
  object(context, name);
  const { decision, plan, policyDecision, approval = null } = context;

  object(decision, `${name}.decision`);
  object(plan, `${name}.plan`);
  object(policyDecision, `${name}.policyDecision`);

  string(decision.decisionId, `${name}.decision.decisionId`);
  string(decision.selectedProposalId, `${name}.decision.selectedProposalId`);
  string(plan.planId, `${name}.plan.planId`);
  string(plan.decisionId, `${name}.plan.decisionId`);
  string(plan.proposalId, `${name}.plan.proposalId`);
  string(plan.planHash, `${name}.plan.planHash`);
  string(policyDecision.policyDecisionId, `${name}.policyDecision.policyDecisionId`);
  string(policyDecision.planHash, `${name}.policyDecision.planHash`);

  const runtimeReport = evidenceRecord.payload.runtimeReport;

  if (plan.decisionId !== decision.decisionId) {
    throw new Error(`${name} plan decision mismatch`);
  }
  if (plan.proposalId !== decision.selectedProposalId) {
    throw new Error(`${name} plan proposal mismatch`);
  }
  if (runtimeReport.decisionId !== decision.decisionId) {
    throw new Error(`${name} runtime decision mismatch`);
  }
  if (runtimeReport.planId !== plan.planId) {
    throw new Error(`${name} runtime plan mismatch`);
  }
  if (runtimeReport.proposalId !== plan.proposalId) {
    throw new Error(`${name} runtime proposal mismatch`);
  }
  if (runtimeReport.policyDecisionId !== policyDecision.policyDecisionId) {
    throw new Error(`${name} runtime policy mismatch`);
  }
  if (evidenceRecord.source.policyDecisionId !== policyDecision.policyDecisionId) {
    throw new Error(`${name} evidence policy mismatch`);
  }
  if (policyDecision.planHash !== plan.planHash) {
    throw new Error(`${name} policy planHash mismatch`);
  }

  if (runtimeReport.requestedMode === "execute") {
    object(approval, `${name}.approval`);
    for (const field of ["approvalId", "approvedBy", "tenantId", "decisionId", "proposalId", "planHash"]) {
      string(approval[field], `${name}.approval.${field}`);
    }
    if (approval.status !== "approved") {
      throw new Error(`${name}.approval.status must be approved`);
    }
    if (approval.tenantId !== evidenceRecord.tenantId) {
      throw new Error(`${name} approval tenant mismatch`);
    }
    if (approval.decisionId !== decision.decisionId) {
      throw new Error(`${name} approval decision mismatch`);
    }
    if (approval.proposalId !== plan.proposalId) {
      throw new Error(`${name} approval proposal mismatch`);
    }
    if (approval.planHash !== plan.planHash) {
      throw new Error(`${name} approval planHash mismatch`);
    }
    if (runtimeReport.approvalId !== approval.approvalId) {
      throw new Error(`${name} runtime approval mismatch`);
    }
    if (approval.consumedAt != null || approval.used === true) {
      throw new Error(`${name} approval must not be replayed`);
    }
  } else if (approval != null) {
    throw new Error(`${name} preview must not carry approval`);
  }

  return context;
}

export const evidenceAuditContractVersion = VERSION;

export function assertEvidenceAuditHandoffContract(
  handoff,
  name = "evidenceAuditHandoff",
) {
  object(handoff, name);
  if (handoff.schemaVersion !== VERSION) {
    throw new Error(`${name}.schemaVersion must be ${VERSION}`);
  }
  if (handoff.from !== "kernel-evidence" || handoff.to !== "kernel-audit") {
    throw new Error(`${name} must route kernel-evidence -> kernel-audit`);
  }

  for (const field of ["handoffId", "cycleId", "createdAt"]) {
    string(handoff[field], `${name}.${field}`);
  }
  assertTenantContextContract(handoff.tenantContext, `${name}.tenantContext`);
  object(handoff.payload, `${name}.payload`);
  assertRuntimeEvidenceRecordContract(
    handoff.payload.evidenceRecord,
    `${name}.payload.evidenceRecord`,
  );
  assertLifecycleContext(
    handoff.payload.lifecycle,
    handoff.payload.evidenceRecord,
    `${name}.payload.lifecycle`,
  );

  const record = handoff.payload.evidenceRecord;
  if (record.tenantId !== handoff.tenantContext.tenantId) {
    throw new Error(`${name} tenantId mismatch`);
  }
  if (record.correlationId !== handoff.cycleId) {
    throw new Error(`${name} cycleId mismatch`);
  }

  for (const field of ["mutationAllowed", "approvalAllowed", "executionAllowed"]) {
    falseOnly(handoff[field], `${name}.${field}`);
  }
  return handoff;
}

export function createEvidenceAuditHandoff({
  handoffId,
  cycleId,
  tenantContext,
  evidenceRecord,
  lifecycle,
  createdAt = new Date().toISOString(),
} = {}) {
  const handoff = {
    schemaVersion: VERSION,
    handoffId,
    from: "kernel-evidence",
    to: "kernel-audit",
    cycleId,
    tenantContext: clone(tenantContext),
    payload: {
      evidenceRecord: clone(evidenceRecord),
      lifecycle: clone(lifecycle),
    },
    createdAt,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
  };

  assertEvidenceAuditHandoffContract(handoff);
  return deepFreeze(handoff);
}

export function assertGovernedAuditReportContract(
  report,
  name = "governedAuditReport",
) {
  object(report, name);
  for (const field of [
    "auditId",
    "generatedAt",
    "requestedBy",
    "scope",
    "tenantId",
    "cycleId",
    "sourceHandoffId",
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
  if (!["compliant", "attention", "non-compliant", "insufficient-evidence"].includes(report.status)) {
    throw new Error(`${name}.status is invalid`);
  }
  falseOnly(report.mutationAllowed, `${name}.mutationAllowed`);
  falseOnly(report.executionAllowed, `${name}.executionAllowed`);
  if (report.evidenceVerified !== true) {
    throw new Error(`${name}.evidenceVerified must be true`);
  }

  object(report.subject, `${name}.subject`);
  object(report.summary, `${name}.summary`);
  if (!Array.isArray(report.checks) || report.checks.length === 0) {
    throw new TypeError(`${name}.checks must be a non-empty array`);
  }
  if (!Array.isArray(report.evidence) || !report.evidence.includes(report.sourceEvidenceId)) {
    throw new Error(`${name}.evidence must include sourceEvidenceId`);
  }
  const total =
    report.summary.pass +
    report.summary.warn +
    report.summary.fail +
    report.summary.unknown;
  if (report.summary.total !== total || report.summary.total !== report.checks.length) {
    throw new Error(`${name}.summary is inconsistent`);
  }

  object(report.constraints, `${name}.constraints`);
  for (const field of [
    "humanAuthorityRequired",
    "traceabilityRequired",
    "evidenceIntegrityRequired",
    "tenantIsolationRequired",
  ]) {
    if (report.constraints[field] !== true) {
      throw new Error(`${name}.constraints.${field} must be true`);
    }
  }
  for (const field of ["automaticApprovalAllowed", "automaticExecutionAllowed", "crossTenantAccessAllowed"]) {
    falseOnly(report.constraints[field], `${name}.constraints.${field}`);
  }
  return report;
}
