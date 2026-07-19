import {
  assertRuntimeEvidenceHandoffContract,
  assertRuntimeEvidenceRecordContract,
} from "@apidevelopers/contracts";
import {
  createEvidenceRegistry,
  verifyEvidence,
} from "./index.mjs";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function recordGovernedRuntimeEvidence({
  handoff,
  registry = createEvidenceRegistry(),
  evidenceId = `evidence.${handoff?.payload?.runtimeReport?.reportId ?? "runtime"}`,
} = {}) {
  assertRuntimeEvidenceHandoffContract(handoff);

  const report = handoff.payload.runtimeReport;
  const record = registry.record({
    evidenceId,
    tenantId: handoff.tenantContext.tenantId,
    type: "runtime-report",
    source: {
      component: "kernel-runtime",
      reportId: report.reportId,
      policyDecisionId: report.policyDecisionId,
      handoffId: report.sourceHandoffId,
    },
    payload: {
      runtimeReport: report,
    },
    status: "active",
    correlationId: handoff.cycleId,
    metadata: {
      immutable: true,
      redacted: true,
      schemaVersion: 1,
    },
  });

  assertRuntimeEvidenceRecordContract(record);
  if (!verifyEvidence(record)) {
    throw new Error("runtime evidence integrity verification failed");
  }

  return deepFreeze(record);
}
