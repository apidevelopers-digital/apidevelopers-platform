import test from "node:test";
import assert from "node:assert/strict";

import {
  createAgentManifest,
  createHumanApproval,
  createOrchestrationAssignment,
  createOrchestrationMission,
  createOrchestrationPlan,
  createTenantContext,
} from "../src/index.mjs";

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

test("creates bound, immutable orchestration contracts", () => {
  const mission = createOrchestrationMission({
    missionId: "mission.001",
    cycleId: "cycle.001",
    objective: "Prepare an evidence-backed multi-agent plan",
    requester: "Igor",
    tenantContext,
    policyDecision: policyDecision(),
    successCriteria: ["Plan is traceable"],
    evidenceRefs: ["evidence.001"],
    budget: { maxAgents: 2, maxAssignments: 2, maxToolCalls: 4 },
    createdAt: "2026-07-26T10:00:00.000Z",
  });
  const agent = createAgentManifest({
    agentId: "agent.research",
    role: "researcher",
    version: "1.0.0",
    tenantContext,
    capabilities: ["github.read"],
    maxAssignments: 1,
  });
  const assignment = createOrchestrationAssignment({
    assignmentId: "assignment.001",
    missionId: mission.missionId,
    cycleId: mission.cycleId,
    taskId: "task.001",
    agentId: agent.agentId,
    expectedOutput: "Evidence-backed inventory",
    tenantContext,
    requiredCapabilities: ["github.read"],
    evidenceRequired: ["source-sha"],
    createdAt: "2026-07-26T10:00:00.000Z",
  });
  const approval = createHumanApproval({
    approvalId: "approval.001",
    approvedBy: "Igor",
    tenantId: "tenant_001",
    cycleId: "cycle.001",
    missionId: "mission.001",
    approvedAt: "2026-07-26T10:00:00.000Z",
    expiresAt: "2026-07-26T11:00:00.000Z",
  });
  const plan = createOrchestrationPlan({
    planId: "orchestration-plan.001",
    mission,
    agents: [agent],
    assignments: [assignment],
    approval,
    status: "ready",
    generatedAt: "2026-07-26T10:05:00.000Z",
  });

  assert.equal(plan.executionAllowed, false);
  assert.equal(plan.constraints.crossTenantAccessAllowed, false);
  assert.equal(Object.isFrozen(plan), true);
});

test("rejects tenant and cycle mismatches", () => {
  assert.throws(
    () =>
      createOrchestrationMission({
        missionId: "mission.invalid",
        cycleId: "cycle.other",
        objective: "Invalid mission",
        requester: "Igor",
        tenantContext,
        policyDecision: policyDecision(),
        successCriteria: ["Never created"],
        evidenceRefs: ["evidence.001"],
      }),
    /cycleId mismatch/,
  );
});

test("rejects replayed approval", () => {
  const approval = {
    ...createHumanApproval({
      approvalId: "approval.replayed",
      approvedBy: "Igor",
      tenantId: "tenant_001",
      cycleId: "cycle.001",
      missionId: "mission.001",
      approvedAt: "2026-07-26T10:00:00.000Z",
      expiresAt: "2026-07-26T11:00:00.000Z",
    }),
    replayed: true,
  };

  assert.throws(
    () =>
      createOrchestrationPlan({
        planId: "plan.invalid",
        mission: createOrchestrationMission({
          missionId: "mission.001",
          cycleId: "cycle.001",
          objective: "Invalid approval",
          requester: "Igor",
          tenantContext,
          policyDecision: policyDecision(),
          successCriteria: ["Never ready"],
          evidenceRefs: ["evidence.001"],
        }),
        agents: [
          createAgentManifest({
            agentId: "agent.001",
            role: "researcher",
            version: "1.0.0",
            tenantContext,
            capabilities: ["github.read"],
          }),
        ],
        assignments: [
          createOrchestrationAssignment({
            assignmentId: "assignment.001",
            missionId: "mission.001",
            cycleId: "cycle.001",
            taskId: "task.001",
            agentId: "agent.001",
            expectedOutput: "Inventory",
            tenantContext,
            requiredCapabilities: ["github.read"],
            evidenceRequired: ["source-sha"],
          }),
        ],
        approval,
        status: "ready",
      }),
    /approval replay is blocked/,
  );
});
