import {
  assertPolicyRuntimeHandoffContract,
  assertGovernedRuntimeReportContract,
} from "@apidevelopers/contracts";
import { createRuntimeEngine } from "./index.mjs";

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

export async function runGovernedRuntime({
  handoff,
  engine = createRuntimeEngine(),
  mode = "preview",
  confirmation = null,
} = {}) {
  assertPolicyRuntimeHandoffContract(handoff);

  const { runtimeRequest, policyDecision, approval } = handoff.payload;
  const effectiveMode = mode === "execute" ? "execute" : "preview";

  if (effectiveMode === "execute" && policyDecision.effect !== "allow") {
    const blocked = freeze({
      runtimeReportId: `runtime-report.${handoff.handoffId}`,
      generatedAt: new Date().toISOString(),
      tenantId: handoff.tenantContext.tenantId,
      cycleId: handoff.cycleId,
      sourceHandoffId: handoff.handoffId,
      sourcePolicyDecisionId: policyDecision.policyDecisionId,
      mode: "execute",
      status: "blocked",
      executed: false,
      reason: "policy-not-authorized",
      constraints: {
        tenantIsolationRequired: true,
        freshHumanApprovalRequired: true,
        explicitConfirmationRequired: true,
        automaticExecutionAllowed: false,
      },
    });
    assertGovernedRuntimeReportContract(blocked);
    return blocked;
  }

  const raw = await engine.run(runtimeRequest, {
    mode: effectiveMode,
    approval,
    confirmation,
  });

  const report = freeze({
    runtimeReportId: `runtime-report.${raw.runtimeId}`,
    generatedAt: raw.generatedAt,
    tenantId: handoff.tenantContext.tenantId,
    cycleId: handoff.cycleId,
    sourceHandoffId: handoff.handoffId,
    sourcePolicyDecisionId: policyDecision.policyDecisionId,
    mode: raw.mode,
    status: raw.status,
    executed: raw.executed,
    action: raw.action,
    reason: raw.reason ?? null,
    approvalId: raw.approvalId ?? null,
    result: raw.result ?? null,
    constraints: {
      tenantIsolationRequired: true,
      freshHumanApprovalRequired: true,
      explicitConfirmationRequired: true,
      automaticExecutionAllowed: false,
    },
  });

  assertGovernedRuntimeReportContract(report);
  return report;
}
