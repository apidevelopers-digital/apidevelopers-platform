import {
  assertCognitiveHandoffContract,
  assertReflectionReportContract,
  createCognitiveHandoff,
} from "@apidevelopers/contracts";
import { createReflectionEngine } from "./index.mjs";

function assertRoute(handoff) {
  if (handoff.from !== "kernel-reasoning" || handoff.to !== "kernel-reflection") {
    throw new Error("reflection requires a kernel-reasoning -> kernel-reflection handoff");
  }
}

export function runGovernedReflection({
  handoff,
  engine = createReflectionEngine(),
  options = {},
  nextHandoffId,
  createdAt = new Date().toISOString(),
} = {}) {
  assertCognitiveHandoffContract(handoff);
  assertRoute(handoff);

  const rawReport = engine.analyze(handoff.payload.knowledgeSnapshot, options);
  const report = Object.freeze({
    ...rawReport,
    sourceReasoningId: handoff.payload.reasoningReport.reasoningId,
  });

  assertReflectionReportContract(report);

  const nextHandoff = createCognitiveHandoff({
    handoffId: nextHandoffId,
    from: "kernel-reflection",
    to: "kernel-planning",
    cycleId: handoff.cycleId,
    tenantContext: handoff.tenantContext,
    payload: {
      reflectionReport: report,
    },
    createdAt,
  });

  return Object.freeze({
    report,
    handoff: nextHandoff,
  });
}
