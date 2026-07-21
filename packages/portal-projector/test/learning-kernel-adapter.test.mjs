import test from "node:test";
import assert from "node:assert/strict";

import { createInstitutionalMemory } from "../../kernel-memory/src/index.mjs";
import { createReflectionEngine } from "../../kernel-reflection/src/index.mjs";
import { createEvolutionEngine } from "../../kernel-evolution/src/index.mjs";
import {
  buildLearningScreenModel,
  projectKernelLearning,
} from "../src/learning-kernel-adapter.mjs";

const fixedClock = () => "2026-07-21T12:00:00.000Z";

test("projects the three canonical kernels into a read-only portal model", () => {
  const memory = createInstitutionalMemory({ clock: fixedClock });
  memory.append({
    id: "lesson.001",
    type: "lesson",
    subject: "portal",
    cycleId: "cycle.001",
    data: { statement: "Prefer one unified portal." },
  });

  const reflectionEngine = createReflectionEngine({ clock: fixedClock });
  const evolutionEngine = createEvolutionEngine({ clock: fixedClock });

  const projection = projectKernelLearning({
    memory,
    reflectionEngine,
    evolutionEngine,
    graphSnapshot: {
      nodes: [{ id: "component.orphan" }],
      relations: [],
    },
    auditReport: {
      auditId: "audit.001",
      status: "attention",
      checks: [{
        ruleId: "AUD-003",
        state: "warn",
        subject: "approval.001",
        statement: "Approval expires soon.",
      }],
    },
    requestedBy: "operator",
    generatedAt: fixedClock(),
  });

  assert.equal(projection.memory.length, 1);
  assert.equal(projection.reflection.length > 0, true);
  assert.equal(projection.evolution.length, 1);
  assert.equal(projection.source.memory.mode, "append-only");
  assert.equal(projection.source.reflection.mode, "advisory");
  assert.equal(projection.source.evolution.mode, "advisory");
  assert.equal(projection.gates.mutationAllowed, false);
  assert.equal(projection.gates.executionAllowed, false);
  assert.equal(projection.gates.automaticApprovalAllowed, false);
});

test("builds the operational screen model without execution capability", () => {
  const projection = projectKernelLearning({
    memory: createInstitutionalMemory({ clock: fixedClock }),
    reflectionEngine: createReflectionEngine({ clock: fixedClock }),
    evolutionEngine: createEvolutionEngine({ clock: fixedClock }),
    generatedAt: fixedClock(),
  });

  const screen = buildLearningScreenModel(projection);

  assert.equal(screen.screenId, "portal.learning");
  assert.equal(screen.readOnly, true);
  assert.equal(screen.sections.length, 3);
  assert.equal(screen.summary.pendingHumanReview, 0);
  assert.equal(screen.gates.executionAllowed, false);
});

test("rejects adapters without the canonical read methods", () => {
  assert.throws(
    () => projectKernelLearning({
      memory: {},
      reflectionEngine: {},
      evolutionEngine: {},
    }),
    /memory\.snapshot must be a function/,
  );
});
