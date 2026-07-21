import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLearningSnapshot, publishLearningSnapshot } from "../src/publisher.mjs";
import { resolveConfig, runCycle } from "../src/worker.mjs";
import { createJsonLearningSnapshotRepository } from "../../api-gateway/src/learning-snapshot-repository.mjs";
import { createLearningRoute } from "../../api-gateway/src/learning-route.mjs";

function assertFunction(value, name) {
  assert.equal(typeof value, "function", `${name} must be a function`);
}

assertFunction(buildLearningSnapshot, "buildLearningSnapshot");
assertFunction(publishLearningSnapshot, "publishLearningSnapshot");
assertFunction(resolveConfig, "resolveConfig");
assertFunction(runCycle, "runCycle");
assertFunction(createJsonLearningSnapshotRepository, "createJsonLearningSnapshotRepository");
assertFunction(createLearningRoute, "createLearningRoute");

const repository = createJsonLearningSnapshotRepository({
  filePath: "/tmp/portal-learning-preflight.json",
});
assertFunction(repository.getLatest, "repository.getLatest");

const route = createLearningRoute({
  repository: {
    getLatest: async () => ({ schemaVersion: "portal.learning-screen/v1" }),
  },
  adminKey: "preflight-key",
});
assertFunction(route.handleRequest, "route.handleRequest");

const response = await route.handleRequest({
  method: "GET",
  url: "/v1/admin/learning",
  headers: { "x-api-key": "preflight-key" },
});
assert.equal(response.status, 200);
assert.equal(response.headers["cache-control"], "no-store");

const body = JSON.parse(response.body);
assert.deepEqual(body.meta, {
  readOnly: true,
  mutationAllowed: false,
  executionAllowed: false,
  automaticApprovalAllowed: false,
});

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const screenPath = path.resolve(currentDir, "../../developer-portal/public/learning.html");
const html = await readFile(screenPath, "utf8");
assert.match(html, /fetch\("\/v1\/admin\/learning"/);
assert.match(html, /method:\s*"GET"/);
assert.doesNotMatch(html, /method:\s*"(POST|PUT|PATCH|DELETE)"/);

console.log(JSON.stringify({
  status: "ok",
  check: "portal_learning_contract_preflight",
  contracts: [
    "worker.publisher",
    "worker.runtime",
    "gateway.repository",
    "gateway.route",
    "portal.screen",
  ],
}));
