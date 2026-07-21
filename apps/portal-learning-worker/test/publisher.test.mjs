import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { publishLearningSnapshot } from "../src/publisher.mjs";
import { createLearningSnapshotRepository } from "../../api-gateway/src/learning-snapshot-repository.mjs";

const clock = () => "2026-07-21T12:00:00.000Z";

test("publishes deterministic read-only snapshot and gateway reads it", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "portal-learning-"));
  const memoryPath = path.join(dir, "memory.json");
  const graphPath = path.join(dir, "graph.json");
  const auditPath = path.join(dir, "audit.json");
  const outputPath = path.join(dir, "portal-learning.json");

  await writeFile(memoryPath, JSON.stringify({ entries: [] }));
  await writeFile(graphPath, JSON.stringify({ nodes: [], relations: [] }));
  await writeFile(auditPath, JSON.stringify({ auditId: "audit-1", status: "compliant", checks: [] }));

  const first = await publishLearningSnapshot({ memoryPath, graphPath, auditPath, outputPath, clock });
  const serializedFirst = await readFile(outputPath, "utf8");
  const second = await publishLearningSnapshot({ memoryPath, graphPath, auditPath, outputPath, clock });
  const serializedSecond = await readFile(outputPath, "utf8");

  assert.deepEqual(second, first);
  assert.equal(serializedSecond, serializedFirst);
  assert.equal(first.readOnly, true);
  assert.deepEqual(first.gates, {
    humanApprovalRequired: true,
    mutationAllowed: false,
    executionAllowed: false,
    automaticApprovalAllowed: false,
  });

  const repository = createLearningSnapshotRepository({ snapshotPath: outputPath });
  const loaded = await repository.read();
  assert.deepEqual(loaded, first);
});

test("fails closed when a real source is absent", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "portal-learning-missing-"));
  await assert.rejects(
    publishLearningSnapshot({
      memoryPath: path.join(dir, "missing-memory.json"),
      graphPath: path.join(dir, "missing-graph.json"),
      auditPath: path.join(dir, "missing-audit.json"),
      outputPath: path.join(dir, "snapshot.json"),
      clock,
    }),
    /ENOENT/,
  );
});
