import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLearningFacade,
  createLearningFacade,
} from "../src/learning-facade.mjs";

test("projects memory, reflection and evolution deterministically", () => {
  const result = buildLearningFacade({
    memories: [{ id: "b" }, { id: "a" }],
    reflections: [{ id: "r1", finding: "repeatable task" }],
    evolutionProposals: [{ id: "e1", title: "automate triage" }],
    generatedAt: "2026-07-21T00:00:00.000Z",
  });

  assert.deepEqual(result.memory.map((item) => item.id), ["a", "b"]);
  assert.equal(result.reflection[0].finding, "repeatable task");
  assert.equal(result.evolution[0].approvalStatus, "pending_human_review");
  assert.equal(result.evolution[0].executionStatus, "not_executed");
});

test("keeps mutation, execution and automatic approval blocked", () => {
  const facade = createLearningFacade();
  const result = facade.project();

  assert.equal(facade.mutationAllowed, false);
  assert.equal(facade.executionAllowed, false);
  assert.equal(facade.automaticApprovalAllowed, false);
  assert.equal(result.gates.humanApprovalRequired, true);
  assert.equal(result.gates.mutationAllowed, false);
  assert.equal(result.gates.executionAllowed, false);
  assert.equal(result.gates.automaticApprovalAllowed, false);
});

test("does not mutate source arrays", () => {
  const memories = [{ id: "b" }, { id: "a" }];
  buildLearningFacade({ memories });
  assert.deepEqual(memories.map((item) => item.id), ["b", "a"]);
});
