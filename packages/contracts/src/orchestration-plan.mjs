import { assertSameTenant, assertTenantContextContract } from "./tenancy-context.mjs";
import {
  orchestrationAssertFalse,
  orchestrationAssertIsoDate,
  orchestrationAssertObject,
  orchestrationAssertString,
  orchestrationAssertTrue,
  orchestrationAssertVersion,
  orchestrationClone,
  orchestrationContractVersion,
  orchestrationDeepFreeze,
  orchestrationNormalizeStrings,
} from "./orchestration-common.mjs";
import {
  assertAgentManifestContract,
  assertHumanApprovalContract,
} from "./orchestration-approval-agent.mjs";
import { assertOrchestrationMissionContract } from "./orchestration-mission.mjs";

const PLAN_STATUSES = new Set(["ready", "blocked"]);
export const orchestrationPlanStatuses = Object.freeze([...PLAN_STATUSES]);

export function assertOrchestrationAssignmentContract(
  assignment,
  name = "orchestrationAssignment",
) {
  orchestrationAssertObject(assignment, name);
  orchestrationAssertVersion(assignment.schemaVersion, name);
  for (const field of [
    "assignmentId",
    "missionId",
    "cycleId",
    "taskId",
    "agentId",
    "expectedOutput",
    "createdAt",
  ]) {
    orchestrationAssertString(assignment[field], `${name}.${field}`);
  }
  orchestrationAssertIsoDate(assignment.createdAt, `${name}.createdAt`);
  assertTenantContextContract(assignment.tenantContext, `${name}.tenantContext`);
  orchestrationNormalizeStrings(assignment.requiredCapabilities, `${name}.requiredCapabilities`, { required: true });
  orchestrationNormalizeStrings(assignment.dependencies, `${name}.dependencies`);
  orchestrationNormalizeStrings(assignment.evidenceRequired, `${name}.evidenceRequired`, { required: true });
  orchestrationAssertTrue(assignment.humanApprovalRequired, `${name}.humanApprovalRequired`);
  orchestrationAssertFalse(assignment.crossTenantAccessAllowed, `${name}.crossTenantAccessAllowed`);
  orchestrationAssertFalse(assignment.externalExecutionAllowed, `${name}.externalExecutionAllowed`);
  return assignment;
}

export function createOrchestrationAssignment({
  assignmentId,
  missionId,
  cycleId,
  taskId,
  agentId,
  expectedOutput,
  tenantContext,
  requiredCapabilities,
  dependencies = [],
  evidenceRequired,
  createdAt = new Date().toISOString(),
} = {}) {
  const assignment = {
    schemaVersion: orchestrationContractVersion,
    assignmentId,
    missionId,
    cycleId,
    taskId,
    agentId,
    expectedOutput,
    tenantContext: orchestrationClone(tenantContext),
    requiredCapabilities: orchestrationNormalizeStrings(requiredCapabilities, "requiredCapabilities", { required: true }),
    dependencies: orchestrationNormalizeStrings(dependencies, "dependencies"),
    evidenceRequired: orchestrationNormalizeStrings(evidenceRequired, "evidenceRequired", { required: true }),
    createdAt,
    humanApprovalRequired: true,
    crossTenantAccessAllowed: false,
    externalExecutionAllowed: false,
  };
  assertOrchestrationAssignmentContract(assignment);
  return orchestrationDeepFreeze(assignment);
}

export function assertOrchestrationPlanContract(plan, name = "orchestrationPlan") {
  orchestrationAssertObject(plan, name);
  orchestrationAssertVersion(plan.schemaVersion, name);
  for (const field of [
    "planId",
    "missionId",
    "cycleId",
    "generatedAt",
    "status",
  ]) {
    orchestrationAssertString(plan[field], `${name}.${field}`);
  }
  orchestrationAssertIsoDate(plan.generatedAt, `${name}.generatedAt`);
  if (!PLAN_STATUSES.has(plan.status)) {
    throw new Error(`${name}.status is invalid`);
  }
  assertTenantContextContract(plan.tenantContext, `${name}.tenantContext`);
  assertOrchestrationMissionContract(plan.mission, `${name}.mission`);
  assertSameTenant(plan.tenantContext, plan.mission.tenantContext);
  if (plan.missionId !== plan.mission.missionId) {
    throw new Error(`${name} missionId mismatch`);
  }
  if (plan.cycleId !== plan.mission.cycleId) {
    throw new Error(`${name} cycleId mismatch`);
  }
  if (!Array.isArray(plan.agents) || plan.agents.length === 0) {
    throw new TypeError(`${name}.agents must be a non-empty array`);
  }
  if (!Array.isArray(plan.assignments) || plan.assignments.length === 0) {
    throw new TypeError(`${name}.assignments must be a non-empty array`);
  }
  for (const [index, agent] of plan.agents.entries()) {
    assertAgentManifestContract(agent, `${name}.agents[${index}]`);
    assertSameTenant(plan.tenantContext, agent.tenantContext);
  }
  for (const [index, assignment] of plan.assignments.entries()) {
    assertOrchestrationAssignmentContract(
      assignment,
      `${name}.assignments[${index}]`,
    );
    assertSameTenant(plan.tenantContext, assignment.tenantContext);
    if (assignment.missionId !== plan.missionId) {
      throw new Error(`${name}.assignments[${index}] missionId mismatch`);
    }
    if (assignment.cycleId !== plan.cycleId) {
      throw new Error(`${name}.assignments[${index}] cycleId mismatch`);
    }
  }
  orchestrationNormalizeStrings(plan.blockers, `${name}.blockers`);
  orchestrationAssertObject(plan.constraints, `${name}.constraints`);
  for (const field of [
    "denyByDefault",
    "tenantIsolationRequired",
    "humanApprovalRequired",
    "evidenceRequired",
    "traceabilityRequired",
  ]) {
    orchestrationAssertTrue(plan.constraints[field], `${name}.constraints.${field}`);
  }
  for (const field of [
    "crossTenantAccessAllowed",
    "automaticApprovalAllowed",
    "automaticExecutionAllowed",
    "mutationAllowed",
    "externalExecutionAllowed",
  ]) {
    orchestrationAssertFalse(plan.constraints[field], `${name}.constraints.${field}`);
  }
  orchestrationAssertFalse(plan.executionAllowed, `${name}.executionAllowed`);
  orchestrationAssertFalse(plan.mutationAllowed, `${name}.mutationAllowed`);

  if (plan.status === "ready") {
    if (plan.blockers.length !== 0) {
      throw new Error(`${name}.blockers must be empty when status is ready`);
    }
    if (plan.mission.policyDecision.effect !== "allow") {
      throw new Error(`${name} requires an allowed policy decision`);
    }
    if (plan.mission.evidenceRefs.length === 0) {
      throw new Error(`${name} requires evidence references`);
    }
    assertHumanApprovalContract(plan.approval, `${name}.approval`, {
      tenantId: plan.tenantContext.tenantId,
      cycleId: plan.cycleId,
      missionId: plan.missionId,
      now: plan.generatedAt,
    });
    if (
      plan.mission.policyDecision.approvalId &&
      plan.approval.approvalId !== plan.mission.policyDecision.approvalId
    ) {
      throw new Error(`${name} approvalId mismatch`);
    }
  } else if (plan.blockers.length === 0) {
    throw new Error(`${name}.blockers must not be empty when status is blocked`);
  }
  return plan;
}

export function createOrchestrationPlan({
  planId,
  mission,
  agents,
  assignments,
  status,
  blockers = [],
  approval = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  assertOrchestrationMissionContract(mission);
  const plan = {
    schemaVersion: orchestrationContractVersion,
    planId,
    missionId: mission.missionId,
    cycleId: mission.cycleId,
    tenantContext: orchestrationClone(mission.tenantContext),
    mission: orchestrationClone(mission),
    agents: orchestrationClone(agents),
    assignments: orchestrationClone(assignments),
    approval: orchestrationClone(approval),
    generatedAt,
    status,
    blockers: orchestrationNormalizeStrings(blockers, "blockers"),
    executionAllowed: false,
    mutationAllowed: false,
    constraints: {
      denyByDefault: true,
      tenantIsolationRequired: true,
      humanApprovalRequired: true,
      evidenceRequired: true,
      traceabilityRequired: true,
      crossTenantAccessAllowed: false,
      automaticApprovalAllowed: false,
      automaticExecutionAllowed: false,
      mutationAllowed: false,
      externalExecutionAllowed: false,
    },
  };
  assertOrchestrationPlanContract(plan);
  return orchestrationDeepFreeze(plan);
}
