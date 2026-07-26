import {
  assertDecisionPolicyHandoffContract,
  assertPolicyDecisionContract,
  createPolicyRuntimeHandoff,
} from "@apidevelopers/contracts";
import { createPolicyEngine } from "./index.mjs";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertRoute(handoff) {
  if (
    handoff.from !== "kernel-decision" ||
    handoff.to !== "kernel-policy"
  ) {
    throw new Error(
      "policy requires a kernel-decision -> kernel-policy handoff",
    );
  }
}

export function runGovernedPolicy({
  handoff,
  engine = createPolicyEngine(),
  dryRun = true,
  approval,
  context = {},
} = {}) {
  assertDecisionPolicyHandoffContract(handoff);
  assertRoute(handoff);

  const {
    decisionReport,
    executionPlan,
    action,
  } = handoff.payload;

  const rawReport = engine.evaluate({
    tenantId: handoff.tenantContext.tenantId,
    cycleId: handoff.cycleId,
    action,
    decision: decisionReport,
    plan: executionPlan,
    dryRun,
    approval,
    context,
  });

  const report = deepFreeze({
    ...rawReport,
    cycleId: handoff.cycleId,
    sourceHandoffId: handoff.handoffId,
    decisionId: decisionReport.decisionId,
    planId: executionPlan.planId,
    approvalId:
      rawReport.executionAllowed === true
        ? approval?.approvalId ?? null
        : null,
  });

  assertPolicyDecisionContract(report);
  return report;
}

export function createGovernedPolicyRuntimeHandoff({
  policyDecision,
  decisionReport,
  executionPlan,
  approval = null,
  tenantContext,
  cycleId = policyDecision?.cycleId,
  handoffId,
  createdAt = new Date().toISOString(),
} = {}) {
  assertPolicyDecisionContract(policyDecision);
  return createPolicyRuntimeHandoff({
    handoffId,
    cycleId,
    tenantContext,
    policyDecision,
    decisionReport,
    executionPlan,
    approval,
    createdAt,
  });
}
