import {
  assertCognitiveHandoffContract,
  assertPlanningReportContract,
  createCognitiveHandoff,
} from "@apidevelopers/contracts";
import { createPlanningEngine } from "./index.mjs";

function assertRoute(handoff) {
  if (handoff.from !== "kernel-reflection" || handoff.to !== "kernel-planning") {
    throw new Error("planning requires a kernel-reflection -> kernel-planning handoff");
  }
}
export function runGovernedPlanning({
  handoff,
  engine = createPlanningEngine(),
  options = {},
} = {}) {
  assertCognitiveHandoffContract(handoff);
  assertRoute(handoff);
  const reflectionReport = handoff.payload.reflectionReport;
  if (reflectionReport.tenantId != null &&
      reflectionReport.tenantId !== handoff.tenantContext.tenantId) {
    throw new Error("cross-tenant planning blocked");
  }
  if (reflectionReport.cycleId != null && reflectionReport.cycleId !== handoff.cycleId) {
    throw new Error("cross-cycle planning blocked");
  }
  const report = engine.plan({
    tenantId: handoff.tenantContext.tenantId,
    cycleId: handoff.cycleId,
    reflectionReport,
  }, options);
  const governedReport = Object.freeze({
    ...report,
    sourceHandoffId: handoff.handoffId,
  });
  assertPlanningReportContract(governedReport);
  return governedReport;
}
export function createPlanningDecisionHandoff({
  planningReport,
  tenantContext,
  cycleId = planningReport?.cycleId,
  handoffId,
  createdAt = new Date().toISOString(),
} = {}) {
  assertPlanningReportContract(planningReport);
  if (planningReport.tenantId != null &&
      planningReport.tenantId !== tenantContext?.tenantId) {
    throw new Error("cross-tenant planning handoff blocked");
  }
  if (planningReport.cycleId != null && planningReport.cycleId !== cycleId) {
    throw new Error("cross-cycle planning handoff blocked");
  }
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
