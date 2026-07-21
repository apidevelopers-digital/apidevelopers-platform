export const MISSION_STATES = Object.freeze([
  "PROPOSED",
  "PLANNED",
  "RUNNING",
  "WAITING",
  "REVIEWING",
  "VALIDATED",
  "REJECTED",
  "CONSOLIDATED",
  "ARCHIVED",
  "CANCELLED"
]);

export const TERMINAL_MISSION_STATES = Object.freeze([
  "ARCHIVED",
  "CANCELLED"
]);

const TRANSITIONS = Object.freeze({
  PROPOSED: ["PLANNED", "REJECTED", "CANCELLED"],
  PLANNED: ["RUNNING", "REJECTED", "CANCELLED"],
  RUNNING: ["WAITING", "REVIEWING", "REJECTED", "CANCELLED"],
  WAITING: ["RUNNING", "REVIEWING", "REJECTED", "CANCELLED"],
  REVIEWING: ["RUNNING", "VALIDATED", "REJECTED", "CANCELLED"],
  VALIDATED: ["CONSOLIDATED", "REJECTED", "CANCELLED"],
  REJECTED: ["PLANNED", "ARCHIVED", "CANCELLED"],
  CONSOLIDATED: ["ARCHIVED", "CANCELLED"],
  ARCHIVED: [],
  CANCELLED: []
});

export function canTransitionMission(from, to) {
  assertMissionState(from);
  assertMissionState(to);
  return TRANSITIONS[from].includes(to);
}

export function transitionMission(mission, to, metadata = {}) {
  validateMission(mission);
  assertMissionState(to);

  if (!canTransitionMission(mission.state, to)) {
    throw new Error(`Invalid mission transition: ${mission.state} -> ${to}`);
  }

  const occurredAt = metadata.occurredAt ?? new Date().toISOString();
  const event = Object.freeze({
    from: mission.state,
    to,
    occurredAt,
    actor: metadata.actor ?? "system",
    reason: metadata.reason ?? null
  });

  return Object.freeze({
    ...mission,
    state: to,
    updatedAt: occurredAt,
    history: Object.freeze([...(mission.history ?? []), event])
  });
}

export function createMission(input) {
  const now = input.createdAt ?? new Date().toISOString();
  const mission = {
    missionId: requiredString(input.missionId, "missionId"),
    objective: requiredString(input.objective, "objective"),
    requester: requiredString(input.requester, "requester"),
    authorityDomain: requiredString(input.authorityDomain, "authorityDomain"),
    tenantId: input.tenantId ?? null,
    risk: input.risk ?? "R1",
    successCriteria: nonEmptyArray(input.successCriteria, "successCriteria"),
    budget: validateBudget(input.budget),
    policies: Object.freeze([...(input.policies ?? [])]),
    approvals: Object.freeze([...(input.approvals ?? [])]),
    artifacts: Object.freeze([]),
    evidence: Object.freeze([]),
    state: "PROPOSED",
    createdAt: now,
    updatedAt: now,
    history: Object.freeze([])
  };

  return Object.freeze(mission);
}

export function createAgentManifest(input) {
  return Object.freeze({
    agentId: requiredString(input.agentId, "agentId"),
    role: requiredString(input.role, "role"),
    cell: oneOf(input.cell, ["A", "B", "C"], "cell"),
    capabilities: Object.freeze(nonEmptyArray(input.capabilities, "capabilities")),
    tools: Object.freeze([...(input.tools ?? [])]),
    dataScopes: Object.freeze([...(input.dataScopes ?? [])]),
    prohibitedActions: Object.freeze([...(input.prohibitedActions ?? [])]),
    modelPolicy: Object.freeze({ ...(input.modelPolicy ?? {}) }),
    resourceLimits: Object.freeze({ ...(input.resourceLimits ?? {}) }),
    completionCriteria: Object.freeze(nonEmptyArray(input.completionCriteria, "completionCriteria")),
    version: requiredString(input.version, "version")
  });
}

export function createAssignment(input) {
  return Object.freeze({
    assignmentId: requiredString(input.assignmentId, "assignmentId"),
    missionId: requiredString(input.missionId, "missionId"),
    taskId: requiredString(input.taskId, "taskId"),
    agentId: requiredString(input.agentId, "agentId"),
    dependencies: Object.freeze([...(input.dependencies ?? [])]),
    inputArtifacts: Object.freeze([...(input.inputArtifacts ?? [])]),
    expectedOutput: requiredString(input.expectedOutput, "expectedOutput"),
    verificationPolicy: Object.freeze({ ...(input.verificationPolicy ?? {}) }),
    state: input.state ?? "ASSIGNED"
  });
}

export function validateMission(mission) {
  if (!mission || typeof mission !== "object") {
    throw new TypeError("mission must be an object");
  }
  requiredString(mission.missionId, "missionId");
  requiredString(mission.objective, "objective");
  requiredString(mission.requester, "requester");
  requiredString(mission.authorityDomain, "authorityDomain");
  nonEmptyArray(mission.successCriteria, "successCriteria");
  validateBudget(mission.budget);
  assertMissionState(mission.state);
  return true;
}

function validateBudget(budget = {}) {
  const normalized = {
    maxTokens: positiveIntegerOrNull(budget.maxTokens, "budget.maxTokens"),
    maxAgents: positiveIntegerOrNull(budget.maxAgents, "budget.maxAgents"),
    maxToolCalls: positiveIntegerOrNull(budget.maxToolCalls, "budget.maxToolCalls"),
    maxCostUsd: nonNegativeNumberOrNull(budget.maxCostUsd, "budget.maxCostUsd"),
    deadlineAt: budget.deadlineAt ?? null
  };
  return Object.freeze(normalized);
}

function assertMissionState(value) {
  if (!MISSION_STATES.includes(value)) {
    throw new TypeError(`Unknown mission state: ${value}`);
  }
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function nonEmptyArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty array`);
  }
  return [...value];
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new TypeError(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

function positiveIntegerOrNull(value, field) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  return value;
}

function nonNegativeNumberOrNull(value, field) {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative finite number`);
  }
  return value;
}
