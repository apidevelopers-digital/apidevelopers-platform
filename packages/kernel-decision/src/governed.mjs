import {
  assertCognitiveHandoffContract,
  assertDecisionReportContract,
  createDecisionPolicyHandoff,
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

export function createGovernedDecisionPolicyHandoff({
  decisionReport,
  executionPlan,
  action,
  tenantContext,
  cycleId = decisionReport?.cycleId,
  handoffId,
  createdAt = new Date().toISOString(),
} = {}) {
  assertDecisionReportContract(decisionReport);
  return createDecisionPolicyHandoff({
    handoffId,
    cycleId,
    tenantContext,
    decisionReport,
    executionPlan,
    action,
    createdAt,
  });
}
