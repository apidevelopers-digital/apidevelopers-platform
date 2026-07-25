import test from "node:test";
import assert from "node:assert/strict";

import {
  createInstitutionalMemory,
  createMemoryReasoningHandoff,
  memoryTypes,
  verifyMemorySnapshotIntegrity,
} from "../src/index.mjs";

function createMemory(tenantId = "tenant_demo_001") {
  let tick = 0;
  return createInstitutionalMemory({
    tenantId,
    clock: () => `2026-07-25T12:00:0${tick++}.000Z`,
  });
}

function tenantContext(tenantId = "tenant_demo_001") {
  return {
    schemaVersion: 1,
    tenantId,
    tenantIdOpaque: true,
    isolationMode: "strict",
    crossTenantAccessAllowed: false,
    globalOperation: false,
    principalId: "principal.memory",
    requestId: "request.memory.001",
    roles: ["memory-writer"],
    permissions: ["memory:read", "memory:write"],
    createdAt: "2026-07-25T12:00:00.000Z",
  };
}

function appendFixture(memory) {
  memory.append({
    id: "memory.problem.0001",
    type: "problem",
    subject: "capability.publishing",
    cycleId: "cycle.0001",
    status: "open",
    data: { summary: "Conteúdo Base64 inválido." },
    recordedBy: "api-toolkit",
  });
  memory.append({
    id: "memory.plan.0001",
    type: "plan",
    subject: "capability.publishing",
    cycleId: "cycle.0001",
    status: "proposed",
    refs: ["memory.problem.0001"],
    data: { summary: "Validar round-trip antes da publicação." },
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
    data: { lesson: "Publicar somente conteúdo validado localmente." },
    recordedBy: "kernel-memory-test",
  });
}

test("exports canonical memory types", () => {
  assert.deepEqual([...memoryTypes].sort(), [
    "decision", "evidence", "execution", "lesson", "outcome", "plan", "problem",
  ]);
  assert.equal(Object.isFrozen(memoryTypes), true);
});

test("requires an explicit tenant and valid clock", () => {
  assert.throws(() => createInstitutionalMemory(), /tenantId/);
  assert.throws(
    () => createInstitutionalMemory({ tenantId: "tenant_demo_001", clock: null }),
    /clock must be a function/,
  );
});

test("appends immutable tenant-bound entries with a digest chain", () => {
  const memory = createMemory();
  appendFixture(memory);

  const snapshot = memory.snapshot();
  assert.equal(snapshot.tenantId, "tenant_demo_001");
  assert.equal(snapshot.entryCount, 3);
  assert.equal(snapshot.entries[0].sequence, 1);
  assert.equal(snapshot.entries[0].previousDigest, null);
  assert.equal(snapshot.entries[1].previousDigest, snapshot.entries[0].digest);
  assert.equal(snapshot.chainHead, snapshot.entries[2].digest);
  assert.equal(memory.verifyIntegrity().valid, true);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.entries[0].data), true);
});

test("blocks cross-tenant writes and reads", () => {
  const memory = createMemory();

  assert.throws(() => memory.append({
    tenantId: "tenant_other_001",
    id: "memory.problem.0001",
    type: "problem",
    subject: "test",
    cycleId: "cycle.0001",
  }), /cross-tenant memory append blocked/);

  assert.throws(
    () => memory.list({ tenantId: "tenant_other_001" }),
    /cross-tenant memory read blocked/,
  );
});

test("rejects duplicate identifiers and preserves append-only history", () => {
  const memory = createMemory();
  const entry = {
    id: "memory.problem.0001",
    type: "problem",
    subject: "test",
    cycleId: "cycle.0001",
  };

  memory.append(entry);
  assert.throws(() => memory.append(entry), /already exists/);
  assert.equal(memory.snapshot().entryCount, 1);
  assert.equal(memory.verifyIntegrity().valid, true);
});

test("filters cycle, subject, type and status", () => {
  const memory = createMemory();
  appendFixture(memory);

  assert.equal(memory.list({ cycleId: "cycle.0001" }).length, 3);
  assert.equal(memory.list({ subject: "capability.publishing" }).length, 3);
  assert.equal(memory.list({ type: "plan" }).length, 1);
  assert.equal(memory.list({ status: "accepted" }).length, 1);
  assert.equal(memory.lessons({ cycleId: "cycle.0001" }).length, 1);

  const cycle = memory.cycle("cycle.0001");
  assert.deepEqual(cycle.summary, {
    total: 3,
    byType: { problem: 1, plan: 1, lesson: 1 },
  });
});

test("returned values cannot mutate internal memory", () => {
  const memory = createMemory();
  appendFixture(memory);

  const fetched = memory.get("memory.lesson.0001");
  assert.throws(() => { fetched.data.lesson = "alterado"; }, TypeError);
  assert.throws(() => { fetched.refs.push("memory.fake"); }, TypeError);

  const stored = memory.get("memory.lesson.0001");
  assert.equal(stored.data.lesson, "Publicar somente conteúdo validado localmente.");
  assert.equal(stored.refs.includes("memory.fake"), false);
});

test("detects tampering in cloned snapshots", () => {
  const memory = createMemory();
  appendFixture(memory);

  const tampered = structuredClone(memory.snapshot());
  tampered.entries[0].data.summary = "corrompido";

  const report = verifyMemorySnapshotIntegrity(tampered);
  assert.equal(report.valid, false);
  assert.equal(report.errors.some((item) => item.startsWith("digest-mismatch:")), true);
});

test("creates a governed memory to reasoning handoff for the same tenant", () => {
  const memory = createMemory();
  appendFixture(memory);

  const handoff = createMemoryReasoningHandoff({
    memory,
    knowledgeSnapshot: { nodes: [], relations: [] },
    tenantContext: tenantContext(),
    cycleId: "cycle.0001",
    handoffId: "handoff.memory.reasoning.0001",
    createdAt: "2026-07-25T12:10:00.000Z",
  });

  assert.equal(handoff.from, "kernel-memory");
  assert.equal(handoff.to, "kernel-reasoning");
  assert.equal(handoff.tenantContext.tenantId, "tenant_demo_001");
  assert.equal(handoff.payload.memorySnapshot.entryCount, 3);
  assert.equal(handoff.mutationAllowed, false);
  assert.equal(handoff.executionAllowed, false);
});

test("blocks cross-tenant memory handoffs", () => {
  const memory = createMemory("tenant_other_001");
  appendFixture(memory);

  assert.throws(() => createMemoryReasoningHandoff({
    memory,
    knowledgeSnapshot: { nodes: [], relations: [] },
    tenantContext: tenantContext("tenant_demo_001"),
    cycleId: "cycle.0001",
    handoffId: "handoff.memory.reasoning.0002",
  }), /cross-tenant memory handoff blocked/);
});
