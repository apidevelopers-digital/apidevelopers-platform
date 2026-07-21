import test from "node:test";
import assert from "node:assert/strict";

import {
  canTransitionMission,
  createAgentManifest,
  createAssignment,
  createMission,
  transitionMission,
  validateMission
} from "../src/index.mjs";

const missionInput = {
  missionId: "mission-001",
  objective: "Inventariar branches sem executar merge",
  requester: "Igor",
  authorityDomain: "github.read",
  risk: "R1",
  successCriteria: ["Inventário reproduzível", "Nenhuma alteração remota"],
  budget: {
    maxTokens: 50000,
    maxAgents: 6,
    maxToolCalls: 100,
    maxCostUsd: 10
  }
};

test("creates and validates a proposed mission", () => {
  const mission = createMission(missionInput);
  assert.equal(mission.state, "PROPOSED");
  assert.equal(validateMission(mission), true);
  assert.equal(Object.isFrozen(mission), true);
});

test("enforces mission state transitions", () => {
  const mission = createMission(missionInput);
  assert.equal(canTransitionMission("PROPOSED", "PLANNED"), true);
  assert.equal(canTransitionMission("PROPOSED", "RUNNING"), false);

  const planned = transitionMission(mission, "PLANNED", {
    actor: "mission-director",
    reason: "Plan accepted",
    occurredAt: "2026-07-21T12:00:00.000Z"
  });

  assert.equal(planned.state, "PLANNED");
  assert.equal(planned.history.length, 1);
  assert.throws(() => transitionMission(mission, "RUNNING"));
});

test("creates governed agent manifests", () => {
  const manifest = createAgentManifest({
    agentId: "branch-inventory-researcher",
    role: "researcher",
    cell: "A",
    capabilities: ["github.read", "branch.classify"],
    tools: ["github"],
    dataScopes: ["sitedauni/apidevelopers-platform"],
    prohibitedActions: ["github.merge", "github.delete"],
    modelPolicy: { preferredClass: "reasoning" },
    resourceLimits: { maxToolCalls: 50 },
    completionCriteria: ["Evidence-backed branch inventory"],
    version: "1.0.0"
  });

  assert.equal(manifest.cell, "A");
  assert.deepEqual(manifest.prohibitedActions, ["github.merge", "github.delete"]);
});

test("creates assignments linked to mission, task and agent", () => {
  const assignment = createAssignment({
    assignmentId: "assignment-001",
    missionId: "mission-001",
    taskId: "task-list-branches",
    agentId: "branch-inventory-researcher",
    expectedOutput: "Classified branch inventory",
    verificationPolicy: { independentReview: true }
  });

  assert.equal(assignment.state, "ASSIGNED");
  assert.equal(assignment.verificationPolicy.independentReview, true);
});
