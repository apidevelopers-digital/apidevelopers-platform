import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/server.mjs";

async function callApp(app, { method = "GET", url, body }) {
  return app.handleRequest({
    method,
    url,
    headers: {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function json(response) {
  return JSON.parse(response.body);
}

test("GET /v1/plugins/infra/health returns infra draft health", async () => {
  const app = createApp();
  const response = await callApp(app, { url: "/v1/plugins/infra/health" });
  assert.equal(response.status, 200);
  const body = json(response);
  assert.equal(body.ok, true);
  assert.equal(body.plugin, "infra");
});

test("GET /v1/plugins/juri/capabilities lists juri operations", async () => {
  const app = createApp();
  const response = await callApp(app, { url: "/v1/plugins/juri/capabilities" });
  assert.equal(response.status, 200);
  const body = json(response);
  assert.ok(body.operations.includes("peterle.documents.search"));
});

test("POST /v1/plugins/juri/call accepts valid dry-run contract", async () => {
  const app = createApp();
  const response = await callApp(app, {
    method: "POST",
    url: "/v1/plugins/juri/call",
    body: {
      operation: "peterle.documents.search",
      dry_run: true,
      payload: { query: "contrato" },
    },
  });
  assert.equal(response.status, 501);
  const body = json(response);
  assert.equal(body.error, "plugin_adapter_not_implemented");
});

test("POST /v1/plugins/media/call blocks real render without confirmation", async () => {
  const app = createApp();
  const response = await callApp(app, {
    method: "POST",
    url: "/v1/plugins/media/call",
    body: {
      operation: "reels.render.from_package",
      dry_run: false,
      payload: { package_id: "demo" },
    },
  });
  assert.equal(response.status, 403);
  const body = json(response);
  assert.equal(body.error, "confirmation_required");
});
