import assert from "node:assert/strict";
import test from "node:test";

import { createChatgptPluginGatewayBridge } from "../src/chatgpt-plugin-gateway.mjs";

test("macroplugin gateway returns infra health", async () => {
  const bridge = createChatgptPluginGatewayBridge();
  const result = await bridge.handleRequest({
    method: "GET",
    pathname: "/v1/plugins/infra/health",
  });

  assert.equal(result.status, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.ok, true);
  assert.equal(body.plugin, "ada-infra");
});

test("macroplugin gateway returns capabilities", async () => {
  const bridge = createChatgptPluginGatewayBridge();
  const result = await bridge.handleRequest({
    method: "GET",
    pathname: "/v1/plugins/juri/capabilities",
  });

  assert.equal(result.status, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.plugin, "ada-juri");
  assert.ok(body.operations.includes("peterle.documents.search"));
});

test("macroplugin gateway blocks real sensitive actions without confirmation", async () => {
  const bridge = createChatgptPluginGatewayBridge();
  const result = await bridge.handleRequest({
    method: "POST",
    pathname: "/v1/plugins/comunicacao/call",
    body: JSON.stringify({
      operation: "action.execute",
      dry_run: false,
      payload: {},
    }),
  });

  assert.equal(result.status, 403);
  const body = JSON.parse(result.body);
  assert.equal(body.error, "confirmation_required");
});

test("macroplugin gateway accepts registered dry-run operations", async () => {
  const bridge = createChatgptPluginGatewayBridge();
  const result = await bridge.handleRequest({
    method: "POST",
    pathname: "/v1/plugins/media/call",
    body: JSON.stringify({
      operation: "reels.package.status",
      dry_run: true,
      payload: { package_id: "demo" },
    }),
  });

  assert.equal(result.status, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.ok, true);
  assert.equal(body.plugin, "ada-media");
  assert.equal(body.status, "accepted_by_gateway_draft");
});
