import test from "node:test";
import assert from "node:assert/strict";

import { createPluginsApp } from "../src/server-plugins.mjs";

function json(response) {
  return JSON.parse(response.body);
}

test("createPluginsApp returns app with plugin routes enabled", async () => {
  const app = createPluginsApp();

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/plugins/infra/health",
  });

  assert.equal(response.status, 200);
  assert.equal(json(response).plugin, "infra");
});

test("createPluginsApp preserves base app routes", async () => {
  const app = createPluginsApp();

  const response = await app.handleRequest({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.status, 200);
  assert.equal(json(response).service, "api-gateway");
});
