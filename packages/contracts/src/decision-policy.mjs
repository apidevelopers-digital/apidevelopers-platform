import { assertDecisionReportContract } from "./cognitive-pipeline.mjs";
import { assertTenantContextContract } from "./tenancy-context.mjs";

const RISK_LEVELS = new Set(["R0", "R1", "R2", "R3", "R4", "R5"]);
const EFFECTS = new Set(["allow", "review", "deny"]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertBoolean(value, name) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${name} must be a boolean`);
  }
}

function assertFalse(value, name) {
  if (value !== false) throw new Error(`${name} must be false`);
}

export const decisionPolicyContractVersion = 1;

export function assertExecutionPlanContract(plan, name = "executionPlan") {
  assertObject(plan, name);
  for (const field of ["planId", "decisionId", "proposalId"]) {
    assertString(plan[field], `${name}.${field}`);
  }
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new TypeError(`${name}.steps must be a non-empty array`);
  }
  for (const [index, step] of plan.steps.entries()) {
    assertObject(step, `${name}.steps[${index}]`);
    assertString(step.stepId, `${name}.steps[${index}].stepId`);
    assertString(step.action, `${name}.steps[${index}].action`);
  }
  assertObject(plan.constraints, `${name}.constraints`);
  for (const field of [
    "humanApprovalRequired",
    "automaticMutationAllowed",
    "automaticApprovalAllowed",
    "automaticExecutionAllowed",
    "mutationAllowed",
    "executionAllowed",
  ]) {
    assertBoolean(plan.constraints[field], `${name}.constraints.${field}`);
  }
  if (plan.constraints.humanApprovalRequired !== true) {
    throw new Error(`${name}.constraints.humanApprovalRequired must be true`);
  }
  for (const field of [
    "automaticMutationAllowed",
    "automaticApprovalAllowed",
    "automaticExecutionAllowed",
    "mutationAllowed",
    "executionAllowed",
  ]) {
    assertFalse(plan.constraints[field], `${name}.constraints.${field}`);
  }
  return plan;
}

export function assertDecisionPolicyHandoffContract(
  handoff,
  name = "decisionPolicyHandoff",
) {
  assertObject(handoff, name);
  if (handoff.schemaVersion !== decisionPolicyContractVersion) {
    throw new Error(
      `${name}.schemaVersion must be ${decisionPolicyContractVersion}`,
    );
  }
  if (handoff.from !== "kernel-decision" || handoff.to !== "kernel-policy") {
    throw new Error(
      `${name} must route kernel-decision -> kernel-policy`,
    );
  }
  for (const field of ["handoffId", "cycleId", "createdAt"]) {
    assertString(handoff[field], `${name}.${field}`);
  }
  assertTenantContextContract(
    handoff.tenantContext,
    `${name}.tenantContext`,
  );
  assertObject(handoff.payload, `${name}.payload`);
  const { decisionReport, executionPlan, action } = handoff.payload;
  assertDecisionReportContract(
    decisionReport,
    `${name}.payload.decisionReport`,
  );
  assertExecutionPlanContract(
    executionPlan,
    `${name}.payload.executionPlan`,
  );
  assertObject(action, `${name}.payload.action`);
  assertString(action.name, `${name}.payload.action.name`);

  if (executionPlan.decisionId !== decisionReport.decisionId) {
    throw new Error(`${name} decisionId mismatch`);
  }
  if (executionPlan.proposalId !== decisionReport.selectedProposalId) {
    throw new Error(`${name} proposalId mismatch`);
  }
  if (executionPlan.steps[0].action !== action.name) {
    throw new Error(`${name} action must match the first execution step`);
  }
  if (
    decisionReport.tenantId &&
    decisionReport.tenantId !== handoff.tenantContext.tenantId
  ) {
    throw new Error(`${name} tenantId mismatch`);
  }
  if (
    executionPlan.tenantId &&
    executionPlan.tenantId !== handoff.tenantContext.tenantId
  ) {
    throw new Error(`${name} executionPlan tenantId mismatch`);
  }
  if (decisionReport.cycleId && decisionReport.cycleId !== handoff.cycleId) {
    throw new Error(`${name} cycleId mismatch`);
  }

  for (const field of [
    "mutationAllowed",
    "approvalAllowed",
    "executionAllowed",
  ]) {
    assertFalse(handoff[field], `${name}.${field}`);
  }
  return handoff;
}

export function createDecisionPolicyHandoff({
  handoffId,
  cycleId,
  tenantContext,
  decisionReport,
  executionPlan,
  action,
  createdAt = new Date().toISOString(),
} = {}) {
  const handoff = {
    schemaVersion: decisionPolicyContractVersion,
    handoffId,
    from: "kernel-decision",
    to: "kernel-policy",
    cycleId,
    tenantContext: clone(tenantContext),
    payload: {
      decisionReport: clone(decisionReport),
      executionPlan: clone(executionPlan),
      action: clone(action),
    },
    createdAt,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
  };
  assertDecisionPolicyHandoffContract(handoff);
  return deepFreeze(handoff);
}

export function assertPolicyDecisionContract(
  report,
  name = "policyDecision",
) {
  assertObject(report, name);
  for (const field of [
    "policyDecisionId",
    "evaluatedAt",
    "tenantId",
    "cycleId",
    "sourceHandoffId",
    "decisionId",
    "planId",
  ]) {
    assertString(report[field], `${name}.${field}`);
  }
  assertObject(report.action, `${name}.action`);
  assertString(report.action.name, `${name}.action.name`);
  if (!RISK_LEVELS.has(report.risk)) {
    throw new Error(`${name}.risk is invalid`);
  }
  if (!EFFECTS.has(report.effect)) {
    throw new Error(`${name}.effect is invalid`);
  }
  if (!Array.isArray(report.reasons)) {
    throw new TypeError(`${name}.reasons must be an array`);
  }
  for (const field of [
    "dryRun",
    "approvalRequired",
    "humanReviewRequired",
    "previewAllowed",
    "executionAllowed",
    "mutationAllowed",
  ]) {
    assertBoolean(report[field], `${name}.${field}`);
  }
  if (report.dryRun === true) {
    assertFalse(report.approvalRequired, `${name}.approvalRequired`);
    assertFalse(report.executionAllowed, `${name}.executionAllowed`);
    assertFalse(report.mutationAllowed, `${name}.mutationAllowed`);
  } else if (report.approvalRequired !== true) {
    throw new Error(`${name}.approvalRequired must be true for real execution`);
  }
  if (report.executionAllowed || report.mutationAllowed) {
    if (report.effect !== "allow") {
      throw new Error(`${name}.effect must be allow when execution is enabled`);
    }
    assertString(report.approvalId, `${name}.approvalId`);
  }

  assertObject(report.constraints, `${name}.constraints`);
  const requiredTrue = [
    "denyByDefault",
    "tenantIsolationRequired",
    "traceabilityRequired",
    "approvalBoundToPlan",
    "riskR5Blocked",
  ];
  for (const field of requiredTrue) {
    if (report.constraints[field] !== true) {
      throw new Error(`${name}.constraints.${field} must be true`);
    }
  }
  if (report.constraints.approvalReplayAllowed !== false) {
    throw new Error(
      `${name}.constraints.approvalReplayAllowed must be false`,
    );
  }
  return report;
}
