import { assertRuntimeReportContract } from "./policy-runtime.mjs";
import { assertTenantContextContract } from "./tenancy-context.mjs";

const VERSION = 1;
const HEX_256 = /^[a-f0-9]{64}$/;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertFalse(value, name) {
  if (value !== false) throw new Error(`${name} must be false`);
}

export const runtimeEvidenceContractVersion = VERSION;

export function assertRuntimeEvidenceHandoffContract(
  handoff,
  name = "runtimeEvidenceHandoff",
) {
  assertObject(handoff, name);
  if (handoff.schemaVersion !== VERSION) {
    throw new Error(`${name}.schemaVersion must be ${VERSION}`);
  }
  if (handoff.from !== "kernel-runtime" || handoff.to !== "kernel-evidence") {
    throw new Error(`${name} must route kernel-runtime -> kernel-evidence`);
  }

  for (const field of ["handoffId", "cycleId", "createdAt"]) {
    assertString(handoff[field], `${name}.${field}`);
  }
  assertTenantContextContract(
    handoff.tenantContext,
    `${name}.tenantContext`,
  );
  assertObject(handoff.payload, `${name}.payload`);
  assertRuntimeReportContract(
    handoff.payload.runtimeReport,
    `${name}.payload.runtimeReport`,
  );

  const report = handoff.payload.runtimeReport;
  if (report.tenantId !== handoff.tenantContext.tenantId) {
    throw new Error(`${name} tenantId mismatch`);
  }
  if (report.cycleId !== handoff.cycleId) {
    throw new Error(`${name} cycleId mismatch`);
  }

  for (const field of [
    "mutationAllowed",
    "approvalAllowed",
    "executionAllowed",
  ]) {
    assertFalse(handoff[field], `${name}.${field}`);
  }
  return handoff;
}

export function createRuntimeEvidenceHandoff({
  handoffId,
  cycleId,
  tenantContext,
  runtimeReport,
  createdAt = new Date().toISOString(),
} = {}) {
  const handoff = {
    schemaVersion: VERSION,
    handoffId,
    from: "kernel-runtime",
    to: "kernel-evidence",
    cycleId,
    tenantContext: clone(tenantContext),
    payload: {
      runtimeReport: clone(runtimeReport),
    },
    createdAt,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
  };

  assertRuntimeEvidenceHandoffContract(handoff);
  return deepFreeze(handoff);
}

export function assertRuntimeEvidenceRecordContract(
  record,
  name = "runtimeEvidenceRecord",
) {
  assertObject(record, name);
  for (const field of [
    "evidenceId",
    "tenantId",
    "type",
    "status",
    "createdAt",
    "correlationId",
  ]) {
    assertString(record[field], `${name}.${field}`);
  }
  if (record.type !== "runtime-report") {
    throw new Error(`${name}.type must be runtime-report`);
  }
  if (record.status !== "active") {
    throw new Error(`${name}.status must be active`);
  }

  assertObject(record.source, `${name}.source`);
  assertString(record.source.component, `${name}.source.component`);
  assertString(record.source.reportId, `${name}.source.reportId`);
  assertString(record.source.policyDecisionId, `${name}.source.policyDecisionId`);
  assertString(record.source.handoffId, `${name}.source.handoffId`);
  if (record.source.component !== "kernel-runtime") {
    throw new Error(`${name}.source.component must be kernel-runtime`);
  }

  assertObject(record.payload, `${name}.payload`);
  assertRuntimeReportContract(
    record.payload.runtimeReport,
    `${name}.payload.runtimeReport`,
  );
  const report = record.payload.runtimeReport;

  if (record.tenantId !== report.tenantId) {
    throw new Error(`${name} tenantId mismatch`);
  }
  if (record.correlationId !== report.cycleId) {
    throw new Error(`${name} correlationId mismatch`);
  }
  if (record.source.reportId !== report.reportId) {
    throw new Error(`${name} reportId mismatch`);
  }
  if (record.source.policyDecisionId !== report.policyDecisionId) {
    throw new Error(`${name} policyDecisionId mismatch`);
  }
  if (record.source.handoffId !== report.sourceHandoffId) {
    throw new Error(`${name} source handoff mismatch`);
  }

  assertObject(record.metadata, `${name}.metadata`);
  if (record.metadata.immutable !== true) {
    throw new Error(`${name}.metadata.immutable must be true`);
  }
  if (record.metadata.redacted !== true) {
    throw new Error(`${name}.metadata.redacted must be true`);
  }
  if (record.metadata.schemaVersion !== VERSION) {
    throw new Error(`${name}.metadata.schemaVersion must be ${VERSION}`);
  }

  assertObject(record.integrity, `${name}.integrity`);
  if (record.integrity.algorithm !== "sha256") {
    throw new Error(`${name}.integrity.algorithm must be sha256`);
  }
  if (
    typeof record.integrity.digest !== "string" ||
    !HEX_256.test(record.integrity.digest)
  ) {
    throw new Error(`${name}.integrity.digest must be a sha256 hex digest`);
  }

  return record;
}
