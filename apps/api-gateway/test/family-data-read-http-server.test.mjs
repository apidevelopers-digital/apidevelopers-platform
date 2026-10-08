import assert from "node:assert/strict";
import test from "node:test";

import { createHttpServerWithFamilyDataRead } from "../src/family-data-read-http-server.mjs";
import { createFamilyDataReadGatewayBinding } from "../src/family-data-read-gateway-binding.mjs";

function baseApp() {
  return {
    async handleRequest(request) {
      return {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          service: "base-app",
          path: new URL(request.url, "http://local").pathname
        })
      };
    }
  };
}

test("HTTP server composition is created inert and never starts listening by itself", () => {
  const runtime = createHttpServerWithFamilyDataRead({ app: baseApp() });

  assert.equal(runtime.server.listening, false);
  assert.equal(runtime.familyDataStatus().enabled, false);
  assert.equal(runtime.familyDataStatus().mode, "inert");

  runtime.server.close();
});

test("explicit Family Data binding can be injected without starting a listener", async () => {
  const familyDataBinding = createFamilyDataReadGatewayBinding({
    enabled: true,
    handler: async () => ({
      status: 200,
      body: { ok: true, source: "family-data" }
    })
  });

  const runtime = createHttpServerWithFamilyDataRead({
    app: baseApp(),
    familyDataBinding
  });

  assert.equal(runtime.server.listening, false);
  assert.equal(runtime.familyDataStatus().enabled, true);

  const response = await runtime.app.handleRequest({
    method: "GET",
    url: "/v1/family/purchases"
  });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    source: "family-data"
  });

  runtime.server.close();
});

test("non Family Data routes remain delegated to the base app", async () => {
  const familyDataBinding = createFamilyDataReadGatewayBinding({
    enabled: true,
    handler: async () => ({
      status: 200,
      body: { ok: true, source: "family-data" }
    })
  });

  const runtime = createHttpServerWithFamilyDataRead({
    app: baseApp(),
    familyDataBinding
  });

  const response = await runtime.app.handleRequest({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), {
    service: "base-app",
    path: "/health"
  });

  runtime.server.close();
});
