import { assertPolicyDecisionContract } from "./decision-policy.mjs";
import { assertTenantContextContract } from "./tenancy-context.mjs";
import {
  orchestrationAssertFalse,
  orchestrationAssertIsoDate,
  orchestrationAssertObject,
  orchestrationAssertPositiveInteger,
  orchestrationAssertString,
  orchestrationAssertVersion,
  orchestrationClone,
  orchestrationContractVersion,
  orchestrationDeepFreeze,
  orchestrationNormalizeStrings,
} from "./orchestration-common.mjs";

const RISK_LEVELS = new Set(["R0", "R1", "R2", "R3", "R4", "R5"]);
const MISSION_STATES = new Set([
  "proposed",
  "planned",
  "ready",
  "running",
  "review",
  "validated",
  "blocked",
  "cancelled",
  "archived",
]);

export const multiAgentOrchestrationContractVersion = orchestrationContractVersion;
export const orchestrationMissionStates = Object.freeze([...MISSION_STATES]);

export function assertOrchestrationMissionContract(
  mission,
  name = "orchestrationMission",
) {
  orchestrationAssertObject(mission, name);
  orchestrationAssertVersion(mission.schemaVersion, name);
  for (const field of [
    "missionId",
    "cycleId",
    "objective",
    "requester",
    "createdAt",
  ]) {
    orchestrationAssertString(mission[field], `${name}.${field}`);
  }
  orchestrationAssertIsoDate(mission.createdAt, `${name}.createdAt`);
  assertTenantContextContract(mission.tenantContext, `${name}.tenantContext`);
  assertPolicyDecisionContract(mission.policyDecision, `${name}.policyDecision`);
  if (mission.cycleId !== mission.policyDecision.cycleId) {
    throw new Error(`${name} cycleId mismatch`);
  }
  if (mission.policyDecision.tenantId !== mission.tenantContext.tenantId) {
    throw new Error(`${name} tenantId mismatch`);
  }
  if (!RISK_LEVELS.has(mission.risk)) {
    throw new Error(`${name}.risk is invalid`);
  }
  if (!MISSION_STATES.has(mission.state)) {
    throw new Error(`${name}.state is invalid`);
  }
  orchestrationNormalizeStrings(mission.successCriteria, `${name}.successCriteria`, { required: true });
  orchestrationNormalizeStrings(mission.evidenceRefs, `${name}.evidenceRefs`);
  orchestrationAssertObject(mission.budget, `${name}.budget`);
  orchestrationAssertPositiveInteger(mission.budget.maxAgents, `${name}.budget.maxAgents`);
  orchestrationAssertPositiveInteger(mission.budget.maxAssignments, `${name}.budget.maxAssignments`);
  orchestrationAssertPositiveInteger(mission.budget.maxToolCalls, `${name}.budget.maxToolCalls`);
  orchestrationAssertFalse(mission.crossTenantAccessAllowed, `${name}.crossTenantAccessAllowed`);
  orchestrationAssertFalse(mission.automaticApprovalAllowed, `${name}.automaticApprovalAllowed`);
  orchestrationAssertFalse(mission.automaticExecutionAllowed, `${name}.automaticExecutionAllowed`);
  return mission;
}

export function createOrchestrationMission({
  missionId,
  cycleId,
  objective,
  requester,
  tenantContext,
  policyDecision,
  risk = "R1",
  successCriteria,
  evidenceRefs = [],
  budget = {},
  state = "proposed",
  createdAt = new Date().toISOString(),
} = {}) {
  const mission = {
    schemaVersion: orchestrationContractVersion,
    missionId,
    cycleId,
    objective,
    requester,
    tenantContext: orchestrationClone(tenantContext),
    policyDecision: orchestrationClone(policyDecision),
    risk,
    successCriteria: orchestrationNormalizeStrings(successCriteria, "successCriteria", { required: true }),
    evidenceRefs: orchestrationNormalizeStrings(evidenceRefs, "evidenceRefs"),
    budget: {
      maxAgents: budget.maxAgents ?? 1,
      maxAssignments: budget.maxAssignments ?? 1,
      maxToolCalls: budget.maxToolCalls ?? 1,
    },
    state,
    createdAt,
    crossTenantAccessAllowed: false,
    automaticApprovalAllowed: false,
    automaticExecutionAllowed: false,
  };
  assertOrchestrationMissionContract(mission);
  return orchestrationDeepFreeze(mission);
}

