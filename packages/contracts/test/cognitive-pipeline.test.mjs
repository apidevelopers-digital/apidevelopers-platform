import test from "node:test";
import assert from "node:assert/strict";

import {
  assertMemorySnapshotContract,
  assertReasoningReportContract,
  assertReflectionReportContract,
  assertPlanningReportContract,
  createCognitiveHandoff,
  assertCognitiveHandoffContract,
} from "../src/cognitive-pipeline.mjs";
import {
  createTenantContext,
  assertTenantContextContract,
  assertSameTenant,
} from "../src/tenancy-context.mjs";

const tenantContext = createTenantContext({
  tenantId: "tenant_demo_0001",
  principalId: "principal.operator",
  requestId: "request.contracts.0001",
  roles: ["operator"],
  permissions: ["read:cognitive-pipeline"],
  createdAt: "2026-07-18T22:30:00.000Z",
});

const memorySnapshot = {
  schemaVersion: 1,
  mode: "append-only",
  mutationAllowed: false,
  entryCount: 1,
  entries: [
    {
      id: "memory.0001",
      type: "evidence",
      subject: "capability.publisher",
      cycleId: "cycle.0001",
      schemaVersion: 1,
    },
  ],
};

const knowledgeSnapshot = {
  nodes: [{ id: "capability.publisher", kind: "capability", status: "active" }],
  relations: [],
};

const reasoningReport = {
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

const reflectionReport = {
  reflectionId: "reflection.0001",
  mode: "advisory",
  mutationAllowed: false,
  summary: { status: "review", counts: { total: 1 } },
  findings: [],
};

const planningReport = {
  planningId: "planning.0001",
  sourceReflectionId: reflectionReport.reflectionId,
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

test("validates the minimum strict tenant context", () => {
  assert.equal(assertTenantContextContract(tenantContext), tenantContext);
  assert.equal(assertSameTenant(tenantContext, structuredClone(tenantContext)), true);
});

test("blocks cross-tenant operations", () => {
  const otherTenant = createTenantContext({
    tenantId: "tenant_demo_0002",
    principalId: "principal.operator",
    requestId: "request.contracts.0002",
    createdAt: "2026-07-18T22:31:00.000Z",
  });

  assert.throws(() => assertSameTenant(tenantContext, otherTenant), /cross-tenant operation blocked/);
});

test("validates the four cognitive stage reports", () => {
  assert.equal(assertMemorySnapshotContract(memorySnapshot), memorySnapshot);
  assert.equal(assertReasoningReportContract(reasoningReport), reasoningReport);
  assert.equal(assertReflectionReportContract(reflectionReport), reflectionReport);
  assert.equal(assertPlanningReportContract(planningReport), planningReport);
});

test("formalizes the three cognitive handoffs without mutation or execution", () => {
  const handoffs = [
    createCognitiveHandoff({
      handoffId: "handoff.memory.reasoning.0001",
      from: "kernel-memory",
      to: "kernel-reasoning",
      cycleId: "cycle.0001",
      tenantContext,
      payload: { memorySnapshot, knowledgeSnapshot },
      createdAt: "2026-07-18T22:32:00.000Z",
    }),
    createCognitiveHandoff({
      handoffId: "handoff.reasoning.reflection.0001",
      from: "kernel-reasoning",
      to: "kernel-reflection",
      cycleId: "cycle.0001",
      tenantContext,
      payload: { reasoningReport, knowledgeSnapshot },
      createdAt: "2026-07-18T22:33:00.000Z",
    }),
    createCognitiveHandoff({
      handoffId: "handoff.reflection.planning.0001",
      from: "kernel-reflection",
      to: "kernel-planning",
      cycleId: "cycle.0001",
      tenantContext,
      payload: { reflectionReport },
      createdAt: "2026-07-18T22:34:00.000Z",
    }),
  ];

  for (const handoff of handoffs) {
    assert.equal(assertCognitiveHandoffContract(handoff), handoff);
    assert.equal(handoff.mutationAllowed, false);
    assert.equal(handoff.approvalAllowed, false);
    assert.equal(handoff.executionAllowed, false);
  }
});

test("blocks unsupported stage jumps", () => {
  assert.throws(
    () =>
      createCognitiveHandoff({
        handoffId: "handoff.memory.planning.0001",
        from: "kernel-memory",
        to: "kernel-planning",
        cycleId: "cycle.0001",
        tenantContext,
        payload: { memorySnapshot },
      }),
    /transition is not allowed/,
  );
});
