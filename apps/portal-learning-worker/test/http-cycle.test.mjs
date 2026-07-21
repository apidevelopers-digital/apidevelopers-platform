import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { publishLearningSnapshot } from "../src/publisher.mjs";
import { createJsonLearningSnapshotRepository } from "../../api-gateway/src/learning-snapshot-repository.mjs";
import { createLearningRoute } from "../../api-gateway/src/learning-route.mjs";

const clock = () => "2026-07-21T12:00:00.000Z";

test("published snapshot returns 200 through the administrative learning route", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "portal-learning-http-"));
  const memoryPath = path.join(dir, "memory.json");
  const graphPath = path.join(dir, "graph.json");
  const auditPath = path.join(dir, "audit.json");
  const outputPath = path.join(dir, "portal-learning.json");

  await writeFile(memoryPath, JSON.stringify({ entries: [] }));
  await writeFile(graphPath, JSON.stringify({ nodes: [], relations: [] }));
  await writeFile(auditPath, JSON.stringify({
    auditId: "audit-http-1",
    status: "compliant",
    checks: [],
  }));

  const snapshot = await publishLearningSnapshot({
    memoryPath,
    graphPath,
    auditPath,
    outputPath,
    clock,
  });

  const repository = createJsonLearningSnapshotRepository({ filePath: outputPath });
  const route = createLearningRoute({ repository, adminKey: "test-admin-key" });
  const response = await route.handleRequest({
    method: "GET",
    url: "/v1/admin/learning",
    headers: { "x-api-key": "test-admin-key" },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "no-store");

  const body = JSON.parse(response.body);
  assert.deepEqual(body.data, snapshot);
  assert.deepEqual(body.meta, {
    readOnly: true,
    mutationAllowed: false,
    executionAllowed: false,
    automaticApprovalAllowed: false,
  });
});

test("learning screen uses only the read-only administrative GET projection", async () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const screenPath = path.resolve(currentDir, "../../developer-portal/public/learning.html");
  const html = await readFile(screenPath, "utf8");

  assert.match(html, /fetch\("\/v1\/admin\/learning"/);
  assert.match(html, /method:\s*"GET"/);
  assert.match(html, /cache:\s*"no-store"/);
  assert.match(html, /x-api-key/);
  assert.doesNotMatch(html, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
  assert.match(html, /não aprova, altera nem executa mudanças/i);
});
