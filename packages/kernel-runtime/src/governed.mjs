import {
  assertPolicyRuntimeHandoffContract,
  assertRuntimeReportContract,
} from "@apidevelopers/contracts";
import { createRuntimeEngine } from "./index.mjs";

function assertRoute(handoff) {
  if (
    handoff.from !== "kernel-policy" ||
    handoff.to !== "kernel-runtime"
  ) {
    throw new Error(
      "runtime requires a kernel-policy -> kernel-runtime handoff",
    );
  }
}

export async function runGovernedRuntime({
  handoff,
  engine = createRuntimeEngine(),
  confirmation,
  continueOnError = false,
} = {}) {
  assertPolicyRuntimeHandoffContract(handoff);
  assertRoute(handoff);

  const {
    policyDecision,
    decisionReport,
    executionPlan,
    approval,
  } = handoff.payload;
  const dryRun = handoff.requestedMode === "preview";

  if (!dryRun && confirmation !== "EXECUTE_APPROVED_PLAN") {
    throw new Error("explicit execution confirmation is required");
  }

  const rawReport = await engine.run(
    decisionReport,
    executionPlan,
    {
      dryRun,
      approval,
      confirmation,
      tenantId: handoff.tenantContext.tenantId,
      requestId: handoff.tenantContext.requestId,
      correlationId: handoff.cycleId,
      continueOnError,
    },
  );

  const executionObserved = rawReport.steps.some(
    (step) => step.status === "executed",
  );
  const report = Object.freeze({
    ...rawReport,
    cycleId: handoff.cycleId,
    sourceHandoffId: handoff.handoffId,
    policyDecisionId: policyDecision.policyDecisionId,
    approvalId: approval?.approvalId ?? null,
    requestedMode: handoff.requestedMode,
    executionAuthorized:
      handoff.requestedMode === "execute" &&
      policyDecision.executionAllowed === true,
    executionObserved,
    mutationObserved: executionObserved,
    constraints: Object.freeze({
      policyGateRequired: true,
      explicitConfirmationRequired: true,
      automaticExecutionAllowed: false,
      tenantIsolationRequired: true,
      evidenceRequired: true,
    }),
  });

  assertRuntimeReportContract(report);
  return report;
}
