import test from "node:test";
import assert from "node:assert/strict";

import { createCognitiveHandoff } from "@apidevelopers/contracts";
import { runGovernedReflection } from "../src/governed.mjs";

const tenantContext = {
  tenantId: "tenant_001",
  principalId: "operator_001",
  roles: ["operator"],
};

function validHandoff() {
  return createCognitiveHandoff({
    handoffId: "handoff.reasoning-reflection.001",
    from: "kernel-reasoning",
    to: "kernel-reflection",
    cycleId: "cycle.001",
    tenantContext,
    payload: {
      reasoningReport: {
        reasoningId: "reasoning.001",
      },
      knowledgeSnapshot: {
        nodes: [],
        relations: [],
      },
    },
    createdAt: "2026-07-26T08:00:00.000Z",
  });
}

test("runs the canonical reasoning to reflection to planning route", () => {
  const result = runGovernedReflection({
    handoff: validHandoff(),
    nextHandoffId: "handoff.reflection-planning.001",
    createdAt: "2026-07-26T08:01:00.000Z",
    engine: {
      analyze() {
        return {
          reflectionId: "reflection.001",
          generatedAt: "2026-07-26T08:01:00.000Z",
          requestedBy: "operator_001",
          scope: "platform",
          mode: "advisory",
          mutationAllowed: false,
          summary: {
            status: "healthy",
            counts: { total: 0, high: 0, medium: 0, low: 0 },
          },
          findings: [],
        };
      },
    },
  });

  assert.equal(result.report.sourceReasoningId, "reasoning.001");
  assert.equal(result.handoff.from, "kernel-reflection");
  assert.equal(result.handoff.to, "kernel-planning");
  assert.equal(result.handoff.cycleId, "cycle.001");
  assert.equal(result.handoff.tenantContext.tenantId, "tenant_001");
  assert.equal(result.handoff.payload.reflectionReport.reflectionId, "reflection.001");
  assert.equal(Object.isFrozen(result), true);
});

test("rejects a non-canonical incoming route", () => {
  const handoff = {
    ...validHandoff(),
    from: "kernel-governance",
  };

  assert.throws(
    () =>
      runGovernedReflection({
        handoff,
        nextHandoffId: "handoff.reflection-planning.002",
      }),
    /kernel-reasoning -> kernel-reflection/,
  );
});
