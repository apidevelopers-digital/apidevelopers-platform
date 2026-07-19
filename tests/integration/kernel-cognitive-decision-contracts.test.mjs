import test from "node:test";
import assert from "node:assert/strict";

import {
  assertDecisionReportContract,
  createTenantContext,
} from "@apidevelopers/contracts";
import {
  createMemoryReasoningHandoff,
} from "@apidevelopers/kernel-memory/governed";
import {
  runGovernedReasoning,
} from "@apidevelopers/kernel-reasoning/governed";
import {
  runGovernedReflection,
} from "@apidevelopers/kernel-reflection/governed";
import {
  createPlanningDecisionHandoff,
  runGovernedPlanning,
} from "@apidevelopers/kernel-planning/governed";
import {
  createDecisionEngine,
} from "@apidevelopers/kernel-decision";
import {
  runGovernedDecision,
} from "@apidevelopers/kernel-decision/governed";

const tenantContext = createTenantContext({
  tenantId: "tenant_demo_0001",
  principalId: "principal.operator",
  requestId: "request.pipeline.decision.0001",
  roles: ["operator"],
  permissions: ["read:cognitive-pipeline"],
  createdAt: "2026-07-19T03:00:00.000Z",
});

const memorySnapshot = {
  schemaVersion: 1,
  mode: "append-only",
  mutationAllowed: false,
  entryCount: 1,
  entries: [{
    id: "memory.0001",
    type: "evidence",
    subject: "capability.publisher",
    cycleId: "cycle.0001",
    schemaVersion: 1,
  }],
};

const knowledgeSnapshot = {
  nodes: [{
    id: "capability.publisher",
    kind: "capability",
    status: "active",
  }],
  relations: [],
};

test(
  "runs memory -> reasoning -> reflection -> planning -> decision through public governed boundaries",
  () => {
    const memoryHandoff = createMemoryReasoningHandoff({
      memorySnapshot,
      knowledgeSnapshot,
      tenantContext,
      cycleId: "cycle.0001",
      handoffId: "handoff.memory.reasoning.0001",
      createdAt: "2026-07-19T03:01:00.000Z",
    });

    const reasoning = runGovernedReasoning({
      handoff: memoryHandoff,
      engine: {
        infer() {
          return {
            reasoningId: "reasoning.0001",
            mode: "read-only",
            mutationAllowed: false,
            summary: {
              status: "attention",
              counts: { total: 1, high: 1 },
            },
            conclusions: [],
            constraints: {
              automaticDecisionAllowed: false,
              automaticExecutionAllowed: false,
              sourceOfTruth: "institutional-knowledge-graph",
            },
          };
        },
      },
      nextHandoffId: "handoff.reasoning.reflection.0001",
      createdAt: "2026-07-19T03:02:00.000Z",
    });

    const reflection = runGovernedReflection({
      handoff: reasoning.handoff,
      engine: {
        analyze() {
          return {
            reflectionId: "reflection.0001",
            mode: "advisory",
            mutationAllowed: false,
            summary: {
              status: "review",
              counts: { total: 1 },
            },
            findings: [],
          };
        },
      },
      nextHandoffId: "handoff.reflection.planning.0001",
      createdAt: "2026-07-19T03:03:00.000Z",
    });

    const planning = runGovernedPlanning({
      handoff: reflection.handoff,
      engine: {
        plan() {
          return {
            planningId: "planning.0001",
            sourceReflectionId: "reflection.0001",
            mode: "advisory",
            mutationAllowed: false,
            approvalAllowed: false,
            executionAllowed: false,
            summary: { proposalCount: 1 },
            proposals: [{
              proposalId: "proposal.0001",
              subject: "capability.publisher",
              category: "architecture",
              priority: "high",
              rationale: "Register a governed provider.",
              requiredEvidence: [],
              requiredReviews: [],
              sourceReflectionId: "reflection.0001",
              sourceReferences: [],
            }],
            constraints: {
              automaticMutationAllowed: false,
              automaticApprovalAllowed: false,
              automaticExecutionAllowed: false,
            },
          };
        },
      },
    });

    const planningHandoff = createPlanningDecisionHandoff({
      planningReport: planning,
      tenantContext,
      cycleId: "cycle.0001",
      handoffId: "handoff.planning.decision.0001",
      createdAt: "2026-07-19T03:04:00.000Z",
    });

    const decision = runGovernedDecision({
      handoff: planningHandoff,
      engine: createDecisionEngine({
        clock: () => "2026-07-19T03:05:00.000Z",
      }),
      options: {
        requestedBy: "principal.operator",
        scope: "tenant",
      },
    });

    assert.equal(assertDecisionReportContract(decision), decision);
    assert.equal(decision.sourcePlanningId, planning.planningId);
    assert.equal(decision.sourceReflectionId, "reflection.0001");
    assert.equal(decision.selectedProposalId, "proposal.0001");
    assert.equal(decision.decisionState, "ready-for-human-decision");
    assert.equal(
      decision.recommendation,
      "submit-for-human-approval",
    );
    assert.equal(decision.tenantId, tenantContext.tenantId);
    assert.equal(decision.cycleId, "cycle.0001");
    assert.equal(decision.humanApprovalRequired, true);
    assert.equal(decision.approved, false);
    assert.equal(decision.mutationAllowed, false);
    assert.equal(decision.executionAllowed, false);
    assert.equal(
      decision.constraints.automaticDecisionAllowed,
      false,
    );
    assert.equal(
      decision.constraints.automaticApprovalAllowed,
      false,
    );
    assert.equal(
      decision.constraints.automaticExecutionAllowed,
      false,
    );
  },
);
