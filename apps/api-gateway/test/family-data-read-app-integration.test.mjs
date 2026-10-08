import assert from "node:assert/strict";
import test from "node:test";

import { createAppWithFamilyDataRead } from "../src/family-data-read-app-integration.mjs";
import { createFamilyDataReadGatewayBinding } from "../src/family-data-read-gateway-binding.mjs";

function baseApp() {
  const calls = [];
  return {
    calls,
    async handleRequest(request) {
      calls.push(request);
      return {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ service: "base-app", path: new URL(request.url, "http://local").pathname })
      };
    }
  };
}

test("composition is inert by default and does not alter the canonical createApp runtime", async () => {
  const app = baseApp();
  const composed = createAppWithFamilyDataRead({ app });

  assert.deepEqual(composed.familyDataStatus(), {
    binding: "family-data-read",
    mode: "inert",
    enabled: false,
    configured: false,
    path_prefix: "/v1/family/",
    methods: ["GET"],
    runtime_env_read: false,
    network_io_owned_by_binding: false,
    database_io_owned_by_binding: false,
    deploy_executed: false
  });

  const health = await composed.handleRequest({
    method: "GET",
    url: "/health"
  });
  assert.equal(health.status, 200);
  assert.equal(app.calls.length, 1);

  const family = await composed.handleRequest({
    method: "GET",
    url: "/v1/family/purchases"
  });
  assert.equal(family.status, 503);
  assert.deepEqual(JSON.parse(family.body), {
    ok: false,
    error: "family_data_gateway_binding_disabled"
  });
  assert.equal(app.calls.length, 1);
});

test("enabled binding intercepts only /v1/family/* and leaves all other routes to createApp", async () => {
  const app = baseApp();
  const bindingCalls = [];
  const familyDataBinding = createFamilyDataReadGatewayBinding({
    enabled: true,
    handler: async (request) => {
      bindingCalls.push(request);
      return {
        status: 200,
        body: { ok: true, source: "family-data" }
      };
    }
  });
  const composed = createAppWithFamilyDataRead({ app, familyDataBinding });

  const family = await composed.handleRequest({
    method: "GET",
    url: "/v1/family/purchases?limit=5",
    headers: { "X-Tenant-Id": "homosapiens-id" }
  });
  assert.equal(family.status, 200);
  assert.equal(bindingCalls.length, 1);
  assert.equal(app.calls.length, 0);
  assert.deepEqual(JSON.parse(family.body), {
    ok: true,
    source: "family-data"
  });

  const health = await composed.handleRequest({
    method: "GET",
    url: "/health"
  });
  assert.equal(health.status, 200);
  assert.equal(app.calls.length, 1);
});

test("non-GET Family Data requests are denied before reaching the base app", async () => {
  const app = baseApp();
  let handlerCalls = 0;
  const familyDataBinding = createFamilyDataReadGatewayBinding({
    enabled: true,
    handler: async () => {
      handlerCalls += 1;
      return { status: 200, body: { ok: true } };
    }
  });
  const composed = createAppWithFamilyDataRead({ app, familyDataBinding });

  const response = await composed.handleRequest({
    method: "POST",
    url: "/v1/family/purchases"
  });

  assert.equal(response.status, 405);
  assert.equal(handlerCalls, 0);
  assert.equal(app.calls.length, 0);
});

test("composition requires one explicit base app source", () => {
  assert.throws(
    () => createAppWithFamilyDataRead({ app: baseApp(), appOptions: {} }),
    /provide app or appOptions, not both/
  );
});

test("composition rejects malformed binding before serving requests", () => {
  assert.throws(
    () => createAppWithFamilyDataRead({
      app: baseApp(),
      familyDataBinding: { handleRequest: async () => null }
    }),
    /familyDataBinding must expose handleRequest and status functions/
  );
});
