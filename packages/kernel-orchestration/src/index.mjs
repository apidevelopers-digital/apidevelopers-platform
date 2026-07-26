import {
  assertAgentManifestContract,
  assertHumanApprovalContract,
  assertOrchestrationAssignmentContract,
  assertOrchestrationMissionContract,
  createOrchestrationPlan,
} from "@apidevelopers/contracts";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function addBlocker(blockers, code) {
  if (!blockers.includes(code)) blockers.push(code);
}

function uniqueById(items, field, blockers, code) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item[field])) addBlocker(blockers, code);
    seen.add(item[field]);
  }
}

function hasDependencyCycle(assignments) {
  const ids = new Set(assignments.map((item) => item.assignmentId));
  const graph = new Map(
    assignments.map((item) => [
      item.assignmentId,
      item.dependencies.filter((dependency) => ids.has(dependency)),
    ]),
  );
  const visiting = new Set();
  const visited = new Set();

  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  return [...graph.keys()].some(visit);
}

export const orchestrationBlockers = Object.freeze([
  "policy-not-authorized",
  "approval-required",
  "approval-invalid",
  "evidence-required",
  "agent-budget-exceeded",
  "assignment-budget-exceeded",
  "duplicate-agent-id",
  "duplicate-assignment-id",
  "assignment-agent-missing",
  "assignment-capability-mismatch",
  "agent-assignment-limit-exceeded",
  "assignment-dependency-missing",
  "assignment-dependency-cycle",
  "mission-binding-mismatch",
  "tenant-isolation-violation",
]);

export class OrchestrationEngine {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") throw new TypeError("clock must be a function");
    this.clock = clock;
  }

  plan({
    planId,
    mission,
    agents,
    assignments,
    approval = null,
  } = {}) {
    assertOrchestrationMissionContract(mission);
    if (!Array.isArray(agents) || agents.length === 0) {
      throw new TypeError("agents must be a non-empty array");
    }
    if (!Array.isArray(assignments) || assignments.length === 0) {
      throw new TypeError("assignments must be a non-empty array");
    }
    agents.forEach((agent, index) =>
      assertAgentManifestContract(agent, `agents[${index}]`),
    );
    assignments.forEach((assignment, index) =>
      assertOrchestrationAssignmentContract(
        assignment,
        `assignments[${index}]`,
      ),
    );

    const blockers = [];
    uniqueById(agents, "agentId", blockers, "duplicate-agent-id");
    uniqueById(
      assignments,
      "assignmentId",
      blockers,
      "duplicate-assignment-id",
    );

    if (mission.policyDecision.effect !== "allow") {
      addBlocker(blockers, "policy-not-authorized");
    }
    if (mission.evidenceRefs.length === 0) {
      addBlocker(blockers, "evidence-required");
    }
    if (agents.length > mission.budget.maxAgents) {
      addBlocker(blockers, "agent-budget-exceeded");
    }
    if (assignments.length > mission.budget.maxAssignments) {
      addBlocker(blockers, "assignment-budget-exceeded");
    }

    const agentById = new Map(agents.map((agent) => [agent.agentId, agent]));
    const assignmentIds = new Set(
      assignments.map((assignment) => assignment.assignmentId),
    );
    const assignmentsPerAgent = new Map();

    for (const agent of agents) {
      if (agent.tenantContext.tenantId !== mission.tenantContext.tenantId) {
        throw new Error("cross-tenant orchestration blocked");
      }
    }

    for (const assignment of assignments) {
      if (
        assignment.missionId !== mission.missionId ||
        assignment.cycleId !== mission.cycleId
      ) {
        throw new Error("assignment mission binding mismatch");
      }
      if (
        assignment.tenantContext.tenantId !== mission.tenantContext.tenantId
      ) {
        throw new Error("cross-tenant orchestration blocked");
      }
      const agent = agentById.get(assignment.agentId);
      if (!agent) {
        addBlocker(blockers, "assignment-agent-missing");
        continue;
      }
      const missingCapability = assignment.requiredCapabilities.some(
        (capability) => !agent.capabilities.includes(capability),
      );
      if (missingCapability) {
        addBlocker(blockers, "assignment-capability-mismatch");
      }
      assignmentsPerAgent.set(
        agent.agentId,
        (assignmentsPerAgent.get(agent.agentId) ?? 0) + 1,
      );
      for (const dependency of assignment.dependencies) {
        if (!assignmentIds.has(dependency)) {
          addBlocker(blockers, "assignment-dependency-missing");
        }
      }
    }

    for (const [agentId, count] of assignmentsPerAgent) {
      if (count > agentById.get(agentId).maxAssignments) {
        addBlocker(blockers, "agent-assignment-limit-exceeded");
      }
    }
    if (hasDependencyCycle(assignments)) {
      addBlocker(blockers, "assignment-dependency-cycle");
    }

    if (!approval) {
      addBlocker(blockers, "approval-required");
    } else {
      try {
        assertHumanApprovalContract(approval, "approval", {
          tenantId: mission.tenantContext.tenantId,
          cycleId: mission.cycleId,
          missionId: mission.missionId,
          now: this.clock(),
        });
      } catch {
        addBlocker(blockers, "approval-invalid");
      }
    }

    return createOrchestrationPlan({
      planId,
      mission,
      agents: clone(agents),
      assignments: clone(assignments),
      approval: clone(approval),
      status: blockers.length === 0 ? "ready" : "blocked",
      blockers,
      generatedAt: this.clock(),
    });
  }
}

export function createOrchestrationEngine(options = {}) {
  return new OrchestrationEngine(options);
}
