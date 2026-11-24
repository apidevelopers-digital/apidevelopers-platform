import test from "node:test";
import assert from "node:assert/strict";

import { tryHandlePluginRoute } from "../src/plugin-routes.mjs";

function json(response) {
  return JSON.parse(response.body);
}

test("tryHandlePluginRoute returns null for non-plugin routes", async () => {
  const response = await tryHandlePluginRoute({ method: "GET", url: "/health" });
  assert.equal(response, null);
});

test("tryHandlePluginRoute handles infra health", async () => {
  const response = await tryHandlePluginRoute({ method: "GET", url: "/v1/plugins/infra/health" });
  assert.equal(response.status, 200);
  assert.equal(json(response).plugin, "infra");
});

test("tryHandlePluginRoute handles media capabilities", async () => {
  const response = await tryHandlePluginRoute({ method: "GET", url: "/v1/plugins/media/capabilities" });
  assert.equal(response.status, 200);
  assert.ok(json(response).operations.includes("reels.package.status"));
});

test("tryHandlePluginRoute handles juri call dry-run contract", async () => {
  const response = await tryHandlePluginRoute({
    method: "POST",
    url: "/v1/plugins/juri/call",
    body: JSON.stringify({
      operation: "mitra.runtime.status",
      dry_run: true,
      payload: {},
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(json(response).plugin, "juri");
});

test("tryHandlePluginRoute blocks bad json body", async () => {
  const response = await tryHandlePluginRoute({
    method: "POST",
    url: "/v1/plugins/juri/call",
    body: "{not json",
  });

  assert.equal(response.status, 400);
  assert.equal(json(response).error, "invalid_json_body");
});
