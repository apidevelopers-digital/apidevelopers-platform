import test from "node:test";
import assert from "node:assert/strict";

import {
  attachMitraPublicResearchToGateway,
  createMitraPublicOperationalWrapper,
} from "../src/mitra-public-operational-wrapper.mjs";

test("Mitra operational wrapper delegates non-Mitra routes unchanged", async () => {
  const calls = [];
  const app = {
    async handleRequest(request) {
      calls.push(request);
      return { status: 200, headers: {}, body: "base-gateway" };
    },
  };

  const wrapper = createMitraPublicOperationalWrapper({
    app,
    env: {},
    facadeFactory: () => ({
      configured: false,
      async handleRequest(request) {
        if (request.url === "/v1/mitra/public/health") {
          return { status: 503, headers: {}, body: '{"ok":false}' };
        }
        return null;
      },
    }),
  });

  const result = await wrapper.app.handleRequest({ method: "GET", url: "/ready" });

  assert.equal(result.body, "base-gateway");
  assert.equal(calls.length, 1);
  assert.equal(wrapper.descriptor.configured, false);
  assert.equal(wrapper.descriptor.writeExecuted, false);
});

test("Mitra operational wrapper intercepts only the public research surface", async () => {
  let delegated = 0;
  let intercepted = 0;

  const wrapper = createMitraPublicOperationalWrapper({
    app: {
      async handleRequest() {
        delegated += 1;
        return { status: 200, headers: {}, body: "base" };
      },
    },
    env: {
      MITRA_PUBLIC_RESEARCH_UPSTREAM_BASE_URL: "https://juridico.example.test",
    },
    facadeFactory: (options) => {
      assert.equal(options.upstreamBaseUrl, "https://juridico.example.test");
      assert.equal(options.timeoutMs, 12_000);
      assert.equal(options.rateLimitMax, 30);
      assert.equal(options.rateLimitWindowMs, 60_000);

      return {
        configured: true,
        async handleRequest(request) {
          if (request.url === "/v1/mitra/public/search") {
            intercepted += 1;
            return { status: 200, headers: {}, body: '{"ok":true}' };
          }
          return null;
        },
      };
    },
  });

  const result = await wrapper.app.handleRequest({
    method: "POST",
    url: "/v1/mitra/public/search",
    body: '{"query":"lei"}',
  });

  assert.equal(result.status, 200);
  assert.equal(intercepted, 1);
  assert.equal(delegated, 0);
  assert.equal(wrapper.descriptor.configured, true);
});

test("Mitra gateway attachment preserves gateway services and replaces only app", async () => {
  const baseApp = {
    async handleRequest() {
      return { status: 200, headers: {}, body: "base" };
    },
  };
  const gateway = Object.freeze({
    app: baseApp,
    readiness: { status: "ready" },
    store: { mode: "json" },
    audit: { mode: "append-only" },
  });

  const attached = attachMitraPublicResearchToGateway({
    gateway,
    env: {},
    facadeFactory: () => ({
      configured: false,
      async handleRequest() {
        return null;
      },
    }),
  });

  assert.notEqual(attached.app, baseApp);
  assert.equal(attached.readiness, gateway.readiness);
  assert.equal(attached.store, gateway.store);
  assert.equal(attached.audit, gateway.audit);
  assert.equal(attached.mitraPublicResearch.enabled, true);
  assert.equal(attached.mitraPublicResearch.configured, false);
});
