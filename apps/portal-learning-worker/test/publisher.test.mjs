import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { publishLearningSnapshot } from "../src/publisher.mjs";
import { createJsonLearningSnapshotRepository } from "../../api-gateway/src/learning-snapshot-repository.mjs";

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createSources() {
  return {
    memory: {
      entries: [{
        id: "memory.audit",
        type: "evidence",
        subject: "repository.audit",
        cycleId: "cycle.audit",
        status: "observed",
        refs: [".audit/snapshot.json"],
        data: { summary: { changed: 1 } },
        recordedBy: "test",
        recordedAt: "2026-07-21T12:00:00.000Z",
      }],
    },
    graph: {
      nodes: [
        { id: "solution.portal", kind: "solution", status: "active" },
        { id: "capability.learning", kind: "capability", status: "active" },
      ],
      relations: [
        { type: "implements", from: "solution.portal", to: "capability.learning" },
      ],
    },
    audit: {
      auditId: "audit.portal-learning",
      status: "compliant",
      checks: [{
        ruleId: "RULE_1",
        state: "pass",
        subject: "portal-learning",
        statement: "Portal learning contract is valid.",
        recommendation: null,
        evidence: ["test"],
      }],
    },
  };
}

test("publishes a deterministic read-only snapshot and exposes it through the gateway repository", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "portal-learning-publisher-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const memoryPath = path.join(directory, "memory.json");
  const graphPath = path.join(directory, "graph.json");
  const auditPath = path.join(directory, "audit.json");
  const outputPath = path.join(directory, "snapshot.json");
  const sources = createSources();

  await Promise.all([
    writeJson(memoryPath, sources.memory),
    writeJson(graphPath, sources.graph),
    writeJson(auditPath, sources.audit),
  ]);

  const clock = () => "2026-07-21T12:00:00.000Z";
  const input = { memoryPath, graphPath, auditPath, outputPath, clock };

  const first = await publishLearningSnapshot(input);
  const firstBytes = await readFile(outputPath, "utf8");
  const second = await publishLearningSnapshot(input);
  const secondBytes = await readFile(outputPath, "utf8");

  assert.deepEqual(second, first);
  assert.equal(secondBytes, firstBytes);
  assert.equal(first.readOnly, true);
  assert.deepEqual(first.gates, {
    humanApprovalRequired: true,
    mutationAllowed: false,
    executionAllowed: false,
    automaticApprovalAllowed: false,
  });

  const repository = createJsonLearningSnapshotRepository({ filePath: outputPath });
  assert.deepEqual(await repository.getLatest(), first);

  await assert.rejects(
    publishLearningSnapshot({
      ...input,
      memoryPath: path.join(directory, "missing-memory.json"),
    }),
    { code: "ENOENT" },
  );
});

test("concurrent atomic publications leave one valid snapshot and no temporary files", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "portal-learning-concurrency-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const memoryPath = path.join(directory, "memory.json");
  const graphPath = path.join(directory, "graph.json");
  const auditPath = path.join(directory, "audit.json");
  const outputPath = path.join(directory, "snapshot.json");
  const sources = createSources();

  await Promise.all([
    writeJson(memoryPath, sources.memory),
    writeJson(graphPath, sources.graph),
    writeJson(auditPath, sources.audit),
  ]);

  const input = {
    memoryPath,
    graphPath,
    auditPath,
    outputPath,
    clock: () => "2026-07-21T12:00:00.000Z",
  };

  const [left, right] = await Promise.all([
    publishLearningSnapshot(input),
    publishLearningSnapshot(input),
  ]);

  assert.deepEqual(left, right);
  assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), left);

  const leftovers = (await readdir(directory)).filter((name) => name.endsWith(".tmp"));
  assert.deepEqual(leftovers, []);
});
