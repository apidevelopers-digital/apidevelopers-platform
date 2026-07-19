import {
  assertCognitiveHandoffContract,
  assertDecisionReportContract,
} from "@apidevelopers/contracts";
import { createDecisionEngine } from "./index.mjs";

function assertRoute(handoff) {
  if (
    handoff.from !== "kernel-planning" ||
    handoff.to !== "kernel-decision"
  ) {
    throw new Error(
      "decision requires a kernel-planning -> kernel-decision handoff",
    );
  }
}

export function runGovernedDecision({
  handoff,
  engine = createDecisionEngine(),
  options = {},
} = {}) {
  assertCognitiveHandoffContract(handoff);
  assertRoute(handoff);

  const rawReport = engine.evaluate(
    handoff.payload.planningReport,
    options,
  );
  const report = Object.freeze({
    ...rawReport,
    cycleId: handoff.cycleId,
    tenantId: handoff.tenantContext.tenantId,
    sourceHandoffId: handoff.handoffId,
  });

  assertDecisionReportContract(report);
  return report;
}
