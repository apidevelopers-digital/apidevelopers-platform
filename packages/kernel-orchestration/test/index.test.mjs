import test from "node:test";
import assert from "node:assert/strict";

import {
  createAgentManifest,
  createHumanApproval,
  createOrchestrationAssignment,
  createOrchestrationMission,
  createTenantContext,
} from "@apidevelopers/contracts";
import { createOrchestrationEngine } from "../src/index.mjs";

const now = "2026-07-26T10:05:00.000Z";
const tenantContext = createTenantContext({
  tenantId: "tenant_001",
  principalId: "operator_001",
  requestId: "request.orchestration.001",
  roles: ["operator"],
  permissions: ["kernel.orchestration.plan"],
  createdAt: "2026-07-26T10:00:00.000Z",
});

function policyDecision(effect = "allow") {
  return {
    policyDecisionId: "policy.001",
    evaluatedAt: "2026-07-26T10:00:00.000Z",
    tenantId: "tenant_001",
    cycleId: "cycle.001",
    sourceHandoffId: "handoff.001",
    decisionId: "decision.001",
    planId: "plan.source.001",
    action: { name: "multi-agent.plan" },
    risk: "R2",
    effect,
    reasons: [],
    dryRun: false,
    approvalRequired: true,
    humanReviewRequired: true,
    previewAllowed: true,
    executionAllowed: effect === "allow",
    mutationAllowed: false,
    approvalId: effect === "allow" ? "approval.001" : null,
    constraints: {
      denyByDefault: true,
      tenantIsolationRequired: true,
      traceabilityRequired: true,
      approvalBoundToPlan: true,
      riskR5Blocked: true,
      approvalReplayAllowed: false,
    },
  };
}

function fixtures({ effect = "allow", evidenceRefs = ["evidence.001"] } = {}) {
  const mission = createOrchestrationMission({
    missionId: "mission.001",
    cycleId: "cycle.001",
    objective: "Plan a governed multi-agent mission",
    requester: "Igor",
    tenantContext,
    policyDecision: policyDecision(effect),
    successCriteria: ["Every assignment is traceable"],
    evidenceRefs,
    budget: { maxAgents: 2, maxAssignments: 2, maxToolCalls: 5 },
    createdAt: "2026-07-26T10:00:00.000Z",
  });
  const agents = [
    createAgentManifest({
      agentId: "agent.research",
      role: "researcher",
      version: "1.0.0",
      tenantContext,
      capabilities: ["github.read"],
      maxAssignments: 1,
    }),
  ];
  const assignments = [
    createOrchestrationAssignment({
      assignmentId: "assignment.001",
      missionId: mission.missionId,
      cycleId: mission.cycleId,
      taskId: "task.001",
      agentId: "agent.research",
      expectedOutput: "Evidence-backed inventory",
      tenantContext,
      requiredCapabilities: ["github.read"],
      evidenceRequired: ["source-sha"],
      createdAt: "2026-07-26T10:00:00.000Z",
    }),
  ];
  const approval = createHumanApproval({
    approvalId: "approval.001",
    approvedBy: "Igor",
    tenantId: "tenant_001",
    cycleId: "cycle.001",
    missionId: "mission.001",
    approvedAt: "2026-07-26T10:00:00.000Z",
    expiresAt: "2026-07-26T11:00:00.000Z",
  });
  return { mission, agents, assignments, approval };
}

test("produces a ready but non-executable plan", () => {
  const engine = createOrchestrationEngine({ clock: () => now });
  const input = fixtures();
  const before = structuredClone(input);
  const plan = engine.plan({
    planId: "orchestration-plan.001",
    ...input,
  });

  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.executionAllowed, false);
  assert.equal(plan.mutationAllowed, false);
  assert.equal(plan.constraints.automaticExecutionAllowed, false);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(plan), true);
});

test("blocks missing evidence and non-authorized policy", () => {
  const engine = createOrchestrationEngine({ clock: () => now });
  const input = fixtures({ effect: "deny", evidenceRefs: [] });
  const plan = engine.plan({
    planId: "orchestration-plan.blocked",
    ...input,
  });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.blockers.includes("policy-not-authorized"), true);
  assert.equal(plan.blockers.includes("evidence-required"), true);
});

test("blocks missing, expired and replayed approval by invariant", () => {
  const engine = createOrchestrationEngine({ clock: () => now });
  const input = fixtures();

  const missing = engine.plan({
    planId: "orchestration-plan.missing-approval",
    mission: input.mission,
    agents: input.agents,
    assignments: input.assignments,
  });
  assert.equal(missing.blockers.includes("approval-required"), true);

  const expired = engine.plan({
    planId: "orchestration-plan.expired-approval",
    ...input,
    approval: {
      ...input.approval,
      expiresAt: "2026-07-26T10:04:00.000Z",
    },
  });
  assert.equal(expired.blockers.includes("approval-invalid"), true);

  const replayed = engine.plan({
    planId: "orchestration-plan.replayed-approval",
    ...input,
    approval: { ...input.approval, replayed: true },
  });
  assert.equal(replayed.blockers.includes("approval-invalid"), true);
});

test("blocks capability, dependency and assignment limit violations", () => {
  const engine = createOrchestrationEngine({ clock: () => now });
  const input = fixtures();
  const second = createOrchestrationAssignment({
    assignmentId: "assignment.002",
    missionId: "mission.001",
    cycleId: "cycle.001",
    taskId: "task.002",
    agentId: "agent.research",
    expectedOutput: "Write report",
    tenantContext,
    requiredCapabilities: ["github.write"],
    dependencies: ["assignment.missing"],
    evidenceRequired: ["review"],
    createdAt: "2026-07-26T10:00:00.000Z",
  });
  const plan = engine.plan({
    planId: "orchestration-plan.constraint-errors",
    mission: input.mission,
    agents: input.agents,
    assignments: [...input.assignments, second],
    approval: input.approval,
  });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.blockers.includes("assignment-capability-mismatch"), true);
  assert.equal(plan.blockers.includes("assignment-dependency-missing"), true);
  assert.equal(plan.blockers.includes("agent-assignment-limit-exceeded"), true);
});


test("rejects cross-tenant orchestration as a hard invariant", () => {
  const otherTenant = createTenantContext({
    tenantId: "tenant_002",
    principalId: "operator_002",
    requestId: "request.orchestration.002",
    roles: ["operator"],
    permissions: ["kernel.orchestration.plan"],
    createdAt: "2026-07-26T10:00:00.000Z",
  });
  const input = fixtures();
  const foreignAgent = createAgentManifest({
    agentId: "agent.foreign",
    role: "researcher",
    version: "1.0.0",
    tenantContext: otherTenant,
    capabilities: ["github.read"],
  });

  assert.throws(
    () =>
      createOrchestrationEngine({ clock: () => now }).plan({
        planId: "orchestration-plan.cross-tenant",
        mission: input.mission,
        agents: [foreignAgent],
        assignments: input.assignments,
        approval: input.approval,
      }),
    /cross-tenant orchestration blocked/,
  );
});
