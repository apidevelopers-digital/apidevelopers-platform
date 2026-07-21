import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildLearningSnapshot, publishLearningSnapshot } from "../src/publisher.mjs";

const clock = () => "2026-07-21T12:00:00.000Z";

test("builds a supervised read-only learning snapshot", async () => {
  const snapshot = await buildLearningSnapshot({
    clock,
    memoryEntries: [{
      id: "lesson.001", type: "lesson", subject: "portal", cycleId: "cycle.001",
      data: { statement: "reuse canonical contracts" },
    }],
    graphSnapshot: { nodes: [{ id: "component.orphan" }], relations: [] },
    auditReport: {
      auditId: "audit.001", status: "attention",
      checks: [{ ruleId: "AUD-003", state: "warn", subject: "approval.001", statement: "review" }],
    },
  });

  assert.equal(snapshot.readOnly, true);
  assert.equal(snapshot.summary.memories, 1);
  assert.equal(snapshot.summary.findings > 0, true);
  assert.equal(snapshot.summary.proposals, 1);
  assert.equal(snapshot.gates.mutationAllowed, false);
  assert.equal(snapshot.gates.executionAllowed, false);
  assert.equal(snapshot.sections[2].items[0].approvalStatus, "pending_human_review");
});

test("publishes atomically to the gateway snapshot path", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "portal-learning-worker-"));
  const memoryPath = path.join(root, "memory.json");
  const graphPath = path.join(root, "graph.json");
  const auditPath = path.join(root, "audit.json");
  const outputPath = path.join(root, "derived", "portal-learning.json");

  await writeFile(memoryPath, "[]", "utf8");
  await writeFile(graphPath, JSON.stringify({ nodes: [], relations: [] }), "utf8");
  await writeFile(auditPath, JSON.stringify({ auditId: "audit.002", status: "compliant", checks: [] }), "utf8");

  const snapshot = await publishLearningSnapshot({
    memoryPath, graphPath, auditPath, outputPath, clock,
  });
  const stored = JSON.parse(await readFile(outputPath, "utf8"));

  assert.deepEqual(stored, snapshot);
  assert.equal(stored.schemaVersion, "portal.learning-screen/v1");
  assert.equal(stored.gates.automaticApprovalAllowed, false);
});
