import {
  assertCognitiveHandoffContract,
  assertDecisionReportContract,
  createDecisionPolicyHandoff as createDecisionPolicyContractHandoff,
} from "@apidevelopers/contracts";
import { createDecisionEngine } from "./index.mjs";

export function runGovernedDecision({
  handoff,
  engine = createDecisionEngine(),
  options = {},
} = {}) {
  assertCognitiveHandoffContract(handoff);
  if (
    handoff.from !== "kernel-planning" ||
    handoff.to !== "kernel-decision"
  ) {
    throw new Error(
      "decision requires a kernel-planning -> kernel-decision handoff",
    );
  }

  const report = engine.decide(
    {
      tenantId: handoff.tenantContext.tenantId,
      cycleId: handoff.cycleId,
      planningReport: handoff.payload.planningReport,
    },
    options,
  );
  assertDecisionReportContract(report);

  return Object.freeze({
    ...report,
    sourceHandoffId: handoff.handoffId,
  });
}

export function createDecisionPolicyHandoff({
  decisionReport,
  executionPlan,
  action,
  tenantContext,
  cycleId = decisionReport?.cycleId,
  handoffId,
  createdAt = new Date().toISOString(),
} = {}) {
  assertDecisionReportContract(decisionReport);

  return createDecisionPolicyContractHandoff({
    handoffId,
    cycleId,
    tenantContext,
    decisionReport,
    executionPlan,
    action,
    createdAt,
  });
}
