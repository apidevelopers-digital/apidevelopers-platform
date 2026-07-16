import test from "node:test";
import assert from "node:assert/strict";

import {
  createInstitutionalMemory,
  memoryTypes,
} from "../src/index.mjs";

function createMemory() {
  let tick = 0;
  return createInstitutionalMemory({
    clock: () => `2026-07-16T12:00:0${tick++}.000Z`,
  });
}

function appendFixture(memory) {
  memory.append({
    id: "memory.problem.0001",
    type: "problem",
    subject: "capability.publishing",
    cycleId: "cycle.0001",
    status: "open",
    data: { summary: "Base64 invÃ¡lido" },
    recordedBy: "apid-toolkit",
  });

  memory.append({
    id: "memory.plan.0001",
    type: "plan",
    subject: "capability.publishing",
    cycleId: "cycle.0001",
    status: "proposed",
    refs: ["memory.problem.0001"],
    data: { summary: "Validar round-trip antes da publicaÃ§Ã£o" },
    recordedBy: "planning-engine",
  });

  memory.append({
    id: "memory.lesson.0001",
    type: "lesson",
    subject: "capability.publishing",
    cycleId: "cycle.0001",
    status: "accepted",
    refs: ["memory.problem.0001", "memory.plan.0001"],
    evidence: [{ id: "evidence.test.0001", result: "passed" }],
    data: { lesson: "Publicar somente conteÃºdo validado localmente" },
    recordedBy: "kernel-memory-test",
  });
}

test("append records immutable institutional events", () => {
  const memory = createMemory();
  const created = memory.append({
    id: "memory.problem.0001",
    type: "problem",
    subject: "capability.publishing",
    cycleId: "cycle.0001",
    data: { summary: "Base64 invÃ¡lido" },
  });

  assert.equal(created.id, "memory.problem.0001");
  assert.equal(created.recordedAt, "2026-07-16T12:00:00.000Z");
  assert.equal(memory.get(created.id).data.summary, "Base64 invÃ¡lido");
});

test("duplicate identifiers are rejected and history remains append-only", () => {
  const memory = createMemory();
  const entry = {
    id: "memory.problem.0001",
    type: "problem",
    subject: "capability.publishing",
    cycleId: "cycle.0001",
    data: {},
  };

  memory.append(entry);
  assert.throws(() => memory.append(entry), /already exists/i);
  assert.equal(memory.snapshot().entryCount, 1);
  assert.equal(memory.snapshot().mutationAllowed, false);
});

test("list filters by cycle, subject, type and status", () => {
  const memory = createMemory();
  appendFixture(memory);

  assert.equal(memory.list({ cycleId: "cycle.0001" }).length, 3);
  assert.equal(memory.list({ subject: "capability.publishing" }).length, 3);
  assert.equal(memory.list({ type: "plan" }).length, 1);
  assert.equal(memory.list({ status: "accepted" }).length, 1);
  assert.equal(memory.list({ cycleId: "cycle.unknown" }).length, 0);
});

test("cycle and lessons provide stable read models", () => {
  const memory = createMemory();
  appendFixture(memory);

  const cycle = memory.cycle("cycle.0001");
  assert.equal(cycle.summary.total, 3);
  assert.deepEqual(cycle.summary.byType, {
    problem: 1,
    plan: 1,
    lesson: 1,
  });

  const lessons = memory.lessons({
    subject: "capability.publishing",
    cycleId: "cycle.0001",
  });
  assert.equal(lessons.length, 1);
  assert.equal(
    lessons[0].data.lesson,
    "Publicar somente conteÃºdo validado localmente",
  );
});

test("returned values are cloned and cannot mutate internal memory", () => {
  const memory = createMemory();
  appendFixture(memory);

  const fetched = memory.get("memory.lesson.0001");
  fetched.data.lesson = "alterado";
  fetched.refs.push("memory.fake");

  const stored = memory.get("memory.lesson.0001");
  assert.equal(
    stored.data.lesson,
    "Publicar somente conteÃºdo validado localmente",
  );
  assert.equal(stored.refs.includes("memory.fake"), false);

  const snapshot = memory.snapshot();
  snapshot.entries[0].data.summary = "corrompido";
  assert.equal(
    memory.get("memory.problem.0001").data.summary,
    "Base64 invÃ¡lido",
  );
});

test("unsupported types and missing required fields are rejected", () => {
  const memory = createMemory();

  assert.throws(
    () =>
      memory.append({
        id: "memory.invalid.0001",
        type: "unknown",
        subject: "test",
        cycleId: "cycle.0001",
      }),
    /unsupported memory type/i,
  );

  assert.throws(
    () =>
      memory.append({
        id: "memory.invalid.0002",
        type: "problem",
        subject: "",
        cycleId: "cycle.0001",
      }),
    /entry\.subject/i,
  );

  assert.deepEqual(
    [...memoryTypes].sort(),
    [
      "decision",
      "evidence",
      "execution",
      "lesson",
      "outcome",
      "plan",
      "problem",
    ],
  );
});
