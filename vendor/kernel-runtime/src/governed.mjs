import {
  assertPolicyRuntimeHandoffContract,
  assertRuntimeReportContract,
} from "@apidevelopers/contracts";
import { createRuntimeEngine } from "./index.mjs";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function runtimeRequestFromHandoff(handoff) {
  const { decisionReport, executionPlan } = handoff.payload;
  const firstStep = executionPlan.steps[0];

  return {
    tenantId: handoff.tenantContext.tenantId,
    cycleId: handoff.cycleId,
    decisionId: decisionReport.decisionId,
    proposalId: executionPlan.proposalId,
    action: firstStep.action,
    payload: structuredClone(firstStep.input ?? {}),
  };
}

function normalizeState(status) {
  if (status === "previewed") return "previewed";
  if (status === "executed") return "executed";
  return "failed";
}

export async function runGovernedRuntime({
  handoff,
  engine = createRuntimeEngine(),
  mode = handoff?.requestedMode ?? "preview",
  confirmation = null,
} = {}) {
  assertPolicyRuntimeHandoffContract(handoff);

  const effectiveMode = mode === "execute" ? "execute" : "preview";
  if (effectiveMode !== handoff.requestedMode) {
    throw new Error("runtime mode must match the governed policy handoff");
  }

  const {
    decisionReport,
    executionPlan,
    policyDecision,
    approval,
  } = handoff.payload;

  const request = runtimeRequestFromHandoff(handoff);
  const raw = await engine.run(request, {
    mode: effectiveMode,
    approval,
    confirmation,
  });

  const state = normalizeState(raw.status);
  const observedStatus =
    state === "previewed"
      ? "previewed"
      : state === "executed"
        ? "executed"
        : "failed";

  const report = deepFreeze({
    reportId: `runtime-report.${raw.runtimeId}`,
    planId: executionPlan.planId,
    decisionId: decisionReport.decisionId,
    proposalId: executionPlan.proposalId,
    tenantId: handoff.tenantContext.tenantId,
    cycleId: handoff.cycleId,
    sourceHandoffId: handoff.handoffId,
    policyDecisionId: policyDecision.policyDecisionId,
    requestedMode: effectiveMode,
    state,
    startedAt: raw.generatedAt,
    endedAt: raw.generatedAt,
    dryRun: effectiveMode === "preview",
    executionAuthorized:
      effectiveMode === "execute" &&
      policyDecision.executionAllowed === true,
    executionObserved: raw.executed === true,
    mutationObserved: false,
    approvalId:
      effectiveMode === "execute"
        ? raw.approvalId ?? approval?.approvalId ?? null
        : null,
    steps: executionPlan.steps.map((step) => ({
      stepId: step.stepId,
      action: step.action,
      status: observedStatus,
    })),
    evidence: [
      `runtime.${raw.runtimeId}.${observedStatus}`,
    ],
    reason: raw.reason ?? null,
    result: raw.result ?? null,
    constraints: {
      policyGateRequired: true,
      explicitConfirmationRequired: true,
      tenantIsolationRequired: true,
      evidenceRequired: true,
      automaticExecutionAllowed: false,
    },
  });

  assertRuntimeReportContract(report);
  return report;
}
