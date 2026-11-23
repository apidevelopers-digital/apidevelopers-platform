import test from "node:test";
import assert from "node:assert/strict";

import { createPluginAwareApp } from "../src/plugin-aware-app.mjs";

function json(response) {
  return JSON.parse(response.body);
}

test("plugin-aware app intercepts macroplugin routes", async () => {
  let baseCalled = false;
  const app = createPluginAwareApp({
    app: {
      async handleRequest() {
        baseCalled = true;
        return { status: 404, headers: {}, body: "{}" };
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/plugins/infra/health",
    body: undefined,
  });

  assert.equal(baseCalled, false);
  assert.equal(response.status, 200);
  assert.equal(json(response).plugin, "infra");
});

test("plugin-aware app passes non-plugin routes to base app", async () => {
  let baseCalled = false;
  const app = createPluginAwareApp({
    app: {
      async handleRequest(request) {
        baseCalled = true;
        return {
          status: 204,
          headers: { "x-base-app": "true" },
          body: JSON.stringify({ url: request.url }),
        };
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/health",
    body: undefined,
  });

  assert.equal(baseCalled, true);
  assert.equal(response.status, 204);
  assert.equal(json(response).url, "/health");
});

test("plugin-aware app requires a base app handler", () => {
  assert.throws(() => createPluginAwareApp(), /app.handleRequest must be a function/);
});
