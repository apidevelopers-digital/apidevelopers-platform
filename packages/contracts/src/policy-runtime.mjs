import { assertDecisionReportContract } from "./cognitive-pipeline.mjs";
import { assertExecutionPlanContract, assertPolicyDecisionContract } from "./decision-policy.mjs";
import { assertTenantContextContract } from "./tenancy-context.mjs";

const VERSION = 1;
const obj = (v,n) => { if (!v || typeof v !== "object" || Array.isArray(v)) throw new TypeError(`${n} must be an object`); };
const str = (v,n) => { if (typeof v !== "string" || !v.trim()) throw new TypeError(`${n} must be a non-empty string`); };
const bool = (v,n) => { if (typeof v !== "boolean") throw new TypeError(`${n} must be a boolean`); };
const eq = (v,e,n) => { if (v !== e) throw new Error(`${n} must be ${e}`); };
const clone = (v) => v == null ? v : structuredClone(v);
function freeze(v) { if (!v || typeof v !== "object" || Object.isFrozen(v)) return v; Object.freeze(v); for (const c of Object.values(v)) freeze(c); return v; }

export const policyRuntimeContractVersion = VERSION;

export function assertApprovalArtifactContract(approval, name = "approval") {
  obj(approval, name);
  for (const f of ["approvalId","approvedBy","tenantId","decisionId","proposalId","planHash"]) str(approval[f], `${name}.${f}`);
  eq(approval.status, "approved", `${name}.status`);
  if (approval.expiresAt != null) str(approval.expiresAt, `${name}.expiresAt`);
  if (approval.consumedAt != null || approval.used === true) throw new Error(`${name} must not be consumed or replayed`);
  return approval;
}

export function assertPolicyRuntimeHandoffContract(handoff, name = "policyRuntimeHandoff") {
  obj(handoff, name);
  eq(handoff.schemaVersion, VERSION, `${name}.schemaVersion`);
  eq(handoff.from, "kernel-policy", `${name}.from`);
  eq(handoff.to, "kernel-runtime", `${name}.to`);
  for (const f of ["handoffId","cycleId","createdAt"]) str(handoff[f], `${name}.${f}`);
  assertTenantContextContract(handoff.tenantContext, `${name}.tenantContext`);
  obj(handoff.payload, `${name}.payload`);

  const { policyDecision, decisionReport, executionPlan, approval } = handoff.payload;
  assertPolicyDecisionContract(policyDecision, `${name}.payload.policyDecision`);
  assertDecisionReportContract(decisionReport, `${name}.payload.decisionReport`);
  assertExecutionPlanContract(executionPlan, `${name}.payload.executionPlan`);

  if (policyDecision.tenantId !== handoff.tenantContext.tenantId) throw new Error(`${name} tenantId mismatch`);
  if (policyDecision.cycleId !== handoff.cycleId) throw new Error(`${name} cycleId mismatch`);
  if (policyDecision.decisionId !== decisionReport.decisionId) throw new Error(`${name} decisionId mismatch`);
  if (policyDecision.planId !== executionPlan.planId) throw new Error(`${name} planId mismatch`);
  if (executionPlan.decisionId !== decisionReport.decisionId) throw new Error(`${name} execution plan decision mismatch`);
  if (executionPlan.proposalId !== decisionReport.selectedProposalId) throw new Error(`${name} execution plan proposal mismatch`);
  if (policyDecision.action?.name !== executionPlan.steps[0]?.action) throw new Error(`${name} action mismatch`);

  if (!["preview","execute"].includes(handoff.requestedMode)) throw new Error(`${name}.requestedMode is invalid`);
  eq(handoff.approvalAllowed, false, `${name}.approvalAllowed`);
  eq(handoff.explicitConfirmationRequired, true, `${name}.explicitConfirmationRequired`);
  eq(handoff.automaticExecutionAllowed, false, `${name}.automaticExecutionAllowed`);
  bool(handoff.executionAllowed, `${name}.executionAllowed`);
  bool(handoff.mutationAllowed, `${name}.mutationAllowed`);

  if (handoff.requestedMode === "preview") {
    eq(policyDecision.dryRun, true, `${name}.policyDecision.dryRun`);
    eq(policyDecision.effect, "allow", `${name}.policyDecision.effect`);
    eq(policyDecision.previewAllowed, true, `${name}.policyDecision.previewAllowed`);
    eq(policyDecision.executionAllowed, false, `${name}.policyDecision.executionAllowed`);
    eq(policyDecision.mutationAllowed, false, `${name}.policyDecision.mutationAllowed`);
    eq(handoff.executionAllowed, false, `${name}.executionAllowed`);
    eq(handoff.mutationAllowed, false, `${name}.mutationAllowed`);
    if (approval != null) throw new Error(`${name} preview must not carry approval`);
  } else {
    eq(policyDecision.dryRun, false, `${name}.policyDecision.dryRun`);
    eq(policyDecision.effect, "allow", `${name}.policyDecision.effect`);
    eq(policyDecision.approvalRequired, true, `${name}.policyDecision.approvalRequired`);
    eq(policyDecision.executionAllowed, true, `${name}.policyDecision.executionAllowed`);
    eq(policyDecision.mutationAllowed, true, `${name}.policyDecision.mutationAllowed`);
    eq(handoff.executionAllowed, true, `${name}.executionAllowed`);
    eq(handoff.mutationAllowed, true, `${name}.mutationAllowed`);
    assertApprovalArtifactContract(approval, `${name}.payload.approval`);
    if (approval.approvalId !== policyDecision.approvalId) throw new Error(`${name} approvalId mismatch`);
    if (approval.tenantId !== handoff.tenantContext.tenantId) throw new Error(`${name} approval tenant mismatch`);
    if (approval.decisionId !== decisionReport.decisionId) throw new Error `${name} approval decision mismatch`);
    if (approval.proposalId !== executionPlan.proposalId) throw new Error(`${name} approval proposal mismatch`);
    if (approval.planHash !== policyDecision.planHash) throw new Error(`${name} approval planHash mismatch`);
  }
  return handoff;
}

export function createPolicyRuntimeHandoff({
  handoffId, cycleId, tenantContext, policyDecision, decisionReport,
  executionPlan, approval = null, createdAt = new Date().toISOString(),
} = {}) {
  const handoff = {
    schemaVersion: VERSION, handoffId, from: "kernel-policy", to: "kernel-runtime",
    cycleId, tenantContext: clone(tenantContext),
    requestedMode: policyDecision?.dryRun === true ? "preview" : "execute",
    payload: { policyDecision: clone(policyDecision), decisionReport: clone(decisionReport), executionPlan: clone(executionPlan), approval: clone(approval) },
    createdAt, approvalAllowed: false, explicitConfirmationRequired: true,
    automaticExecutionAllowed: false,
    executionAllowed: policyDecision?.executionAllowed === true,
    mutationAllowed: policyDecision?.mutationAllowed === true,
  };
  assertPolicyRuntimeHandoffContract(handoff);
  return freeze(handoff);
}

export function assertRuntimeReportContract(report, name = "runtimeReport") {
  obj(report, name);
  for (const f of ["reportId","planId","decisionId","proposalId","tenantId","cycleId","sourceHandoffId","policyDecisionId","startedAt","endedAt"]) str(report[f], `${name}.${f}`);
  if (!["preview","execute"].includes(report.requestedMode)) throw new Error(`${name}.requestedMode is invalid`);
  if (!["previewed","executed","failed"].includes(report.state)) throw new Error(`${name}.state is invalid`);
  for (const f of ["dryRun","executionAuthorized","executionObserved","mutationObserved"]) bool(report[f], `${name}.${f}`);
  if (!Array.isArray(report.steps) || !report.steps.length) throw new TypeError(`${name}.steps must be a non-empty array`);
  if (!Array.isArray(report.evidence) || !report.evidence.length) throw new TypeError(`${name}.evidence must be a non-empty array`);

  if (report.requestedMode === "preview") {
    eq(report.dryRun, true, `${name}.dryRun`);
    eq(report.state, "previewed", `${name}.state`);
    eq(report.executionAuthorized, false, `${name}.executionAuthorized`);
    eq(report.executionObserved, false, `${name}.executionObserved`);
    eq(report.mutationObserved, false, `${name}.mutationObserved`);
    if (report.approvalId != null) throw new Error(`${name}.approvalId must be null for preview`);
    if (report.steps.some((s) => s.status !== "previewed")) throw new Error(`${name}.steps must remain previewed`);
  } else {
    eq(report.dryRun, false, `${name}.dryRun`);
    eq(report.executionAuthorized, true, `${name}.executionAuthorized`);
    str(report.approvalId, `${name}.approvalId`);
  }

  obj(report.constraints, `${name}.constraints`);
  for (const f of ["policyGateRequired","explicitConfirmationRequired","tenantIsolationRequired","evidenceRequired"]) eq(report.constraints[f], true, `${name}.constraints.${f}`);
  eq(report.constraints.automaticExecutionAllowed, false, `${name}.constraints.automaticExecutionAllowed`);
  return report;
}
