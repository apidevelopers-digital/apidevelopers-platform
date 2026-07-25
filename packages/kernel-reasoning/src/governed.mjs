import {
  assertCognitiveHandoffContract,
  assertReasoningReportContract,
  createCognitiveHandoff,
} from "@apidevelopers/contracts";
import { assertMemorySnapshotIntegrity } from "@apidevelopers/kernel-memory";
import { createReasoningEngine } from "./index.mjs";

function assertRoute(handoff) {
  if (handoff.from !== "kernel-memory" || handoff.to !== "kernel-reasoning") {
    throw new Error("reasoning requires a kernel-memory -> kernel-reasoning handoff");
  }
}
export function runGovernedReasoning({
  handoff,
  engine = createReasoningEngine(),
  options = {},
  nextHandoffId,
  createdAt = new Date().toISOString(),
} = {}) {
  assertCognitiveHandoffContract(handoff);
  assertRoute(handoff);
  assertMemorySnapshotIntegrity(handoff.payload.memorySnapshot);
  if (handoff.payload.memorySnapshot.tenantId !== handoff.tenantContext.tenantId) {
    throw new Error("cross-tenant reasoning blocked");
  }
  const report = engine.infer({
    tenantId: handoff.tenantContext.tenantId,
    cycleId: handoff.cycleId,
    knowledgeSnapshot: handoff.payload.knowledgeSnapshot,
    memorySnapshot: handoff.payload.memorySnapshot,
  }, options);
  assertReasoningReportContract(report);
  const nextHandoff = createCognitiveHandoff({
    handoffId: nextHandoffId,
    from: "kernel-reasoning",
    to: "kernel-reflection",
    cycleId: handoff.cycleId,
    tenantContext: handoff.tenantContext,
    payload: { reasoningReport: report, knowledgeSnapshot: handoff.payload.knowledgeSnapshot },
    createdAt,
  });
  return Object.freeze({ report, handoff: nextHandoff });
}
