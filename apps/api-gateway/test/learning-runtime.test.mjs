import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createRuntimeApp } from "../src/server.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "api-gateway-learning-"));
  return {
    root,
    clients: path.join(root, "clients.json"),
    audit: path.join(root, "audit.jsonl"),
    learning: path.join(root, "portal-learning.json"),
  };
}

function envFor(files) {
  return {
    API_GATEWAY_ADMIN_KEY: "admin-test-key",
    API_GATEWAY_CLIENT_STORE_PATH: files.clients,
    API_GATEWAY_AUDIT_LOG_PATH: files.audit,
    PORTAL_LEARNING_SNAPSHOT_PATH: files.learning,
    API_GATEWAY_RATE_LIMIT: "50",
    API_GATEWAY_RATE_WINDOW_MS: "60000",
  };
}

function body(response) {
  return JSON.parse(response.body);
}

test("runtime returns 503 when no learning snapshot has been published", async () => {
  const files = await fixture();
  const app = createRuntimeApp(envFor(files));

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/admin/learning",
    headers: { "x-api-key": "admin-test-key" },
  });

  assert.equal(response.status, 503);
  assert.equal(body(response).error, "learning_snapshot_unavailable");
  assert.equal(response.headers["cache-control"], "no-store");
});

test("runtime serves the persisted learning snapshot as read-only data", async () => {
  const files = await fixture();
  const snapshot = {
    schemaVersion: "portal.learning-screen/v1",
    generatedAt: "2026-07-21T00:00:00.000Z",
    summary: {
      memories: 3,
      findings: 2,
      proposals: 1,
      pendingHumanReview: 1,
    },
    sections: [],
  };
  await writeFile(files.learning, JSON.stringify(snapshot), "utf8");
  const app = createRuntimeApp(envFor(files));

  const denied = await app.handleRequest({
    method: "GET",
    url: "/v1/admin/learning",
    headers: { "x-api-key": "wrong-key" },
  });
  const allowed = await app.handleRequest({
    method: "GET",
    url: "/v1/admin/learning",
    headers: { "x-api-key": "admin-test-key" },
  });

  assert.equal(denied.status, 401);
  assert.equal(allowed.status, 200);
  assert.deepEqual(body(allowed).data, snapshot);
  assert.deepEqual(body(allowed).meta, {
    readOnly: true,
    mutationAllowed: false,
    executionAllowed: false,
    automaticApprovalAllowed: false,
  });
});

test("runtime delegates unrelated routes to the existing gateway", async () => {
  const files = await fixture();
  const app = createRuntimeApp(envFor(files));

  const response = await app.handleRequest({
    method: "GET",
    url: "/health",
    headers: {},
  });

  assert.equal(response.status, 200);
  assert.equal(body(response).service, "api-gateway");
});
