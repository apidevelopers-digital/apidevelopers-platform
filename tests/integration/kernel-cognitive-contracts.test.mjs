import test from "node:test";
import assert from "node:assert/strict";

import { createTenantContext } from "@apidevelopers/contracts";
import { createMemoryReasoningHandoff } from "@apidevelopers/kernel-memory/governed";
import { runGovernedReasoning } from "@apidevelopers/kernel-reasoning/governed";
import { runGovernedReflection } from "@apidevelopers/kernel-reflection/governed";
import { runGovernedPlanning } from "@apidevelopers/kernel-planning/governed";

const tenantContext = createTenantContext({
  tenantId: "tenant_demo_0001",
  principalId: "principal.operator",
  requestId: "request.pipeline.0001",
  roles: ["operator"],
  permissions: ["read:cognitive-pipeline"],
  createdAt: "2026-07-19T02:20:00.000Z",
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
  nodes: [{ id: "capability.publisher", kind: "capability", status: "active" }],
  relations: [],
};

test("runs the governed cognitive pipeline across package boundaries", () => {
  const memoryHandoff = createMemoryReasoningHandoff({
    memorySnapshot,
    knowledgeSnapshot,
    tenantContext,
    cycleId: "cycle.0001",
    handoffId: "handoff.memory.reasoning.0001",
    createdAt: "2026-07-19T02:21:00.000Z",
  });

  const reasoning = runGovernedReasoning({
    handoff: memoryHandoff,
    engine: {
      infer() {
        return {
          reasoningId: "reasoning.0001",
          mode: "read-only",
          mutationAllowed: false,
          summary: { status: "attention", counts: { total: 1, high: 1 } },
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
    createdAt: "2026-07-19T02:22:00.000Z",
  });

  const reflection = runGovernedReflection({
    handoff: reasoning.handoff,
    engine: {
      analyze() {
        return {
          reflectionId: "reflection.0001",
          mode: "advisory",
          mutationAllowed: false,
          summary: { status: "review", counts: { total: 1 } },
          findings: [],
        };
      },
    },
    nextHandoffId: "handoff.reflection.planning.0001",
    createdAt: "2026-07-19T02:23:00.000Z",
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
          summary: { proposalCount: 0 },
          proposals: [],
          constraints: {
            automaticMutationAllowed: false,
            automaticApprovalAllowed: false,
            automaticExecutionAllowed: false,
          },
        };
      },
    },
  });

  assert.equal(memoryHandoff.from, "kernel-memory");
  assert.equal(reasoning.handoff.from, "kernel-reasoning");
  assert.equal(reflection.handoff.from, "kernel-reflection");
  assert.equal(planning.sourceReflectionId, "reflection.0001");
  assert.equal(planning.tenantId, tenantContext.tenantId);
  assert.equal(planning.mutationAllowed, false);
  assert.equal(planning.approvalAllowed, false);
  assert.equal(planning.executionAllowed, false);
});
