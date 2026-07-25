import { assertCognitiveHandoffContract, createCognitiveHandoff } from "@apidevelopers/contracts";
import { createPlanningEngine } from "./index.mjs";

function route(handoff) {
  if (handoff.from !== "kernel-reflection" || handoff.to !== "kernel-planning") {
    throw new Error("planning requires a kernel-reflection -> kernel-planning handoff");
  }
}
export function runGovernedPlanning({ handoff, engine=createPlanningEngine(), options={} }={}) {
  assertCognitiveHandoffContract(handoff);
  route(handoff);
  const report = engine.plan({
    tenantId: handoff.tenantContext.tenantId,
    cycleId: handoff.cycleId,
    reflectionReport: handoff.payload.reflectionReport,
  }, options);
  return report;
}
export function createPlanningDecisionHandoff({ planningReport, tenantContext, cycleId=planningReport?.cycleId, handoffId, createdAt=new Date().toISOString() }={}) {
  if (!planningReport || planningReport.tenantId !== tenantContext?.tenantId) throw new Error("planning handoff tenant mismatch");
  if (planningReport.cycleId !== cycleId) throw new Error("planning handoff cycle mismatch");
  return createCognitiveHandoff({
    handoffId, from:"kernel-planning", to:"kernel-decision", cycleId, tenantContext,
    payload:{ planningReport }, createdAt
  });
}
