import {
  assertDecisionPolicyHandoffContract,
  assertPolicyDecisionContract,
  createPolicyRuntimeHandoff,
} from "@apidevelopers/contracts";
import { createPolicyEngine } from "./index.mjs";

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
    action;