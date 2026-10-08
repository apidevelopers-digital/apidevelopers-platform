import assert from "node:assert/strict";
import test from "node:test";

import { createFamilyDataReadGatewayBinding } from "../src/family-data-read-gateway-binding.mjs";

test("Family Data gateway binding is inert by default", async () => {
  const binding = createFamilyDataReadGatewayBinding();

  assert.deepEqual(binding.status(), {
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

  assert.equal(
    binding.planRequest({ method: "GET", url: "/v1/family/purchases?limit=10" }).would_forward,
    false
  );

  const response = await binding.handleRequest({
    method: "GET",
    url: "/v1/family/purchases"
  });
  assert.equal(response.status, 503);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: "family_data_gateway_binding_disabled"
  });
});

test("enabled Family Data gateway binding requires an explicit handler", () => {
  assert.throws(
    () => createFamilyDataReadGatewayBinding({ enabled: true }),
    /handler is required/
  );
});

test("enabled GET binding forwards only normalized read request data", async () => {
  const calls = [];
  const binding = createFamilyDataReadGatewayBinding({
    enabled: true,
    handler: async (request) => {
      calls.push(request);
      return {
        status: 200,
        headers: { "x-family-data-mode": "read-only" },
        body: { ok: true, data: { count: 0 } }
      };
    }
  });

  const plan = binding.planRequest({
    method: "GET",
    url: "/v1/family/purchases?limit=10"
  });
  assert.equal(plan.would_forward, true);

  const response = await binding.handleRequest({
    method: "GET",
    url: "/v1/family/purchases?limit=10",
    headers: {
      "X-Tenant-Id": "homosapiens-id",
      "X-Request-Id": "req_1"
    }
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    method: "GET",
    path: "/v1/family/purchases",
    query: { limit: "10" },
    headers: {
      "x-tenant-id": "homosapiens-id",
      "x-request-id": "req_1"
    }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers["x-family-data-mode"], "read-only");
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    data: { count: 0 }
  });
});

test("binding does not claim routes outside /v1/family/", async () => {
  let calls = 0;
  const binding = createFamilyDataReadGatewayBinding({
    enabled: true,
    handler: async () => {
      calls += 1;
      return { status: 200, body: { ok: true } };
    }
  });

  const response = await binding.handleRequest({
    method: "GET",
    url: "/health"
  });

  assert.equal(response, null);
  assert.equal(calls, 0);
});

test("binding refuses non-GET methods before calling the Family Data handler", async () => {
  let calls = 0;
  const binding = createFamilyDataReadGatewayBinding({
    enabled: true,
    handler: async () => {
      calls += 1;
      return { status: 200, body: { ok: true } };
    }
  });

  const response = await binding.handleRequest({
    method: "POST",
    url: "/v1/family/purchases"
  });

  assert.equal(response.status, 405);
  assert.equal(calls, 0);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: "method_not_allowed"
  });
});
