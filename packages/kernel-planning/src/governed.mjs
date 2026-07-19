import {
  assertCognitiveHandoffContract,
  assertPlanningReportContract,
  createCognitiveHandoff,
} from "@apidevelopers/contracts";
import { createPlanningEngine } from "./index.mjs";

function assertRoute(handoff) {
  if (
    handoff.from !== "kernel-reflection" ||
    handoff.to !== "kernel-planning"
  ) {
    throw new Error(
      "planning requires a kernel-reflection -> kernel-planning handoff",
    );
  }
}

export function runGovernedPlanning({
  handoff,
  engine = createPlanningEngine(),
  options = {},
} = {}) {
  assertCognitiveHandoffContract(handoff);
  assertRoute(handoff);

  const rawReport = engine.plan(
    handoff.payload.reflectionReport,
    options,
  );
  const report = Object.freeze({
    ...rawReport,
    cycleId: handoff.cycleId,
    tenantId: handoff.tenantContext.tenantId,
    sourceHandoffId: handoff.handoffId,
  });

  assertPlanningReportContract(report);
  return report;
}

export function createPlanningDecisionHandoff({
  planningReport,
  tenantContext,
  cycleId = planningReport?.cycleId,
  handoffId,
  createdAt = new Date().toISOString(),
} = {}) {
  assertPlanningReportContract(planningReport);

  return createCognitiveHandoff({
    handoffId,
    from: "kernel-planning",
    to: "kernel-decision",
    cycleId,
    tenantContext,
    payload: { planningReport },
    createdAt,
  });
}
