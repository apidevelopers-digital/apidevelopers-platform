import assert from "node:assert/strict";
import test from "node:test";

import { projectLearningScreen } from "../src/learning-facade.mjs";

test("creates a deterministic read-only learning screen", () => {
  const input = {
    generatedAt: "2026-07-21T00:00:00.000Z",
    sections: {
      memories: [{ id: "m-2" }, { id: "m-1" }],
      findings: [{ id: "f-1" }],
      proposals: [
        { id: "p-2", status: "approved" },
        { id: "p-1", status: "pending" },
      ],
      evidence: [{ id: "e-1" }],
    },
  };

  const first = projectLearningScreen(input);
  const second = projectLearningScreen(input);

  assert.deepEqual(first, second);
  assert.deepEqual(first.summary, {
    memories: 2,
    findings: 1,
    proposals: 2,
    pendingHumanReview: 1,
  });
  assert.deepEqual(first.sections.memories.map((item) => item.id), ["m-1", "m-2"]);
  assert.deepEqual(first.meta, {
    readOnly: true,
    mutationAllowed: false,
    executionAlllowed: false,
    automaticApprovalAllowed: false,
  });
});

test("does not expose internal input state", () => {
  const input = {
    sections: {
      memories: [{ id: "m-1", nested: { safe: true } }],
    },
  };

  const screen = projectLearningScreen(input);
  screen.sections.memories[0].nested.safe = false;

  assert.equal(input.sections.memories[0].nested.safe, true);
});
