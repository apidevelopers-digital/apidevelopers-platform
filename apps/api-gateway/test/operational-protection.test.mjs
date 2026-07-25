import assert from "node:assert/strict";
import test from "node:test";

import {
  createFixedWindowRateLimiter,
  createOperationalProtection,
} from "../src/operational-protection.mjs";

function createApp() {
  return {
    async handleRequest({ url = "/" } = {}) {
      if (url === "/health") {
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "ok" }),
        };
      }

      return {
        status: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "unauthorized" }),
      };
    },
  };
}

test("keeps health public and excludes credentials from audit events", async () => {
  const events = [];
  const protectedApp = createOperationalProtection({
    app: createApp(),
    auditSink: (event) => events.push(event),
    rateLimiter: createFixedWindowRateLimiter({ limit: 1, windowMs: 1_000 }),
    clock: () => "2026-07-25T12:00:00.000Z",
  });

  const health = await protectedApp.handleRequest({
    method: "GET",
    url: "/health",
    headers: { "x-api-key": "must-not-leak" },
  });

  assert.equal(health.status, 200);
  assert.equal(events.length, 0);
  assert.equal(JSON.stringify(protectedApp.metrics.snapshot()).includes("must-not-leak"), false);
});

test("rate limits protected routes by credential fingerprint", async () => {
  let now = 1_000;
  const events = [];
  const limiter = createFixedWindowRateLimiter({
    limit: 2,
    windowMs: 500,
    clock: () => now,
  });
  const protectedApp = createOperationalProtection({
    app: createApp(),
    auditSink: (event) => events.push(event),
    rateLimiter: limiter,
    clock: () => "2026-07-25T12:00:00.000Z",
  });

  const request = {
    method: "GET",
    url: "/v1/whoami",
    headers: {
      "x-tenant-id": "tenant_001",
      "x-api-key": "secret-value",
    },
  };

  assert.equal((await protectedApp.handleRequest(request)).status, 401);
  assert.equal((await protectedApp.handleRequest(request)).status, 401);
  assert.equal((await protectedApp.handleRequest(request)).status, 429);

  assert.equal(JSON.stringify(events).includes("secret-value"), false);
  assert.equal(events.at(-1).type, "gateway.rate_limited");
  assert.match(events.at(-1).credentialFingerprint, /^[a-f0-9]{16}$/);

  now += 500;
  assert.equal((await protectedApp.handleRequest(request)).status, 401);
});

test("isolates concurrent credentials and exposes structured metrics", async () => {
  const events = [];
  const protectedApp = createOperationalProtection({
    app: createApp(),
    auditSink: (event) => events.push(event),
    rateLimiter: createFixedWindowRateLimiter({ limit: 3, windowMs: 1_000 }),
    clock: () => "2026-07-25T12:00:00.000Z",
  });

  const responses = await Promise.all([
    "alpha",
    "alpha",
    "alpha",
    "alpha",
    "beta",
    "beta",
  ].map((credential) =>
    protectedApp.handleRequest({
      method: "GET",
      url: "/v1/whoami",
      headers: {
        "x-tenant-id": "tenant_001",
        "x-api-key": credential,
      },
    }),
  ));

  assert.deepEqual(
    responses.map((response) => response.status),
    [401, 401, 401, 429, 401, 401],
  );

  const snapshot = protectedApp.metrics.snapshot();
  const requests = snapshot.find(
    (entry) =>
      entry.name === "gateway_requests_total" &&
      entry.labels.route === "/v1/whoami",
  );
  const rateLimited = snapshot.find(
    (entry) =>
      entry.name === "gateway_rate_limited_total" &&
      entry.labels.route === "/v1/whoami",
  );

  assert.equal(requests.value, 6);
  assert.equal(rateLimited.value, 1);
  assert.equal(JSON.stringify(events).includes("alpha"), false);
  assert.equal(JSON.stringify(events).includes("beta"), false);
});

test("validates protection contracts", () => {
  assert.throws(
    () => createOperationalProtection({ app: {} }),
    /app\.handleRequest must be a function/,
  );
  assert.throws(
    () => createFixedWindowRateLimiter({ limit: 0 }),
    /limit must be a positive integer/,
  );
});
