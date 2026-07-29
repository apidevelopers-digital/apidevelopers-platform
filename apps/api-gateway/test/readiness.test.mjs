import assert from "node:assert/strict";
import test from "node:test";

import { createReadinessService } from "../src/readiness.mjs";
import { createApp } from "../src/server.mjs";

const FIXED_NOW = "2026-07-29T14:00:00.000Z";

test("readiness reports ready when every check passes", async () => {
  const readiness = createReadinessService({
    now: () => FIXED_NOW,
    checks: [
      {
        name: "database",
        critical: true,
        async run() {
          return { status: "ok", code: "connected" };
        },
      },
      {
        name: "audit",
        critical: false,
        async run() {
          return { status: "ok" };
        },
      },
    ],
  });

  const report = await readiness.check();

  assert.equal(report.status, "ready");
  assert.equal(report.checkedAt, FIXED_NOW);
  assert.equal(report.checks.length, 2);
  assert.equal(report.checks[0].code, "connected");
});

test("readiness reports degraded for a failed non-critical check", async () => {
  const readiness = createReadinessService({
    now: () => FIXED_NOW,
    checks: [
      {
        name: "process",
        critical: true,
        async run() {
          return { status: "ok" };
        },
      },
      {
        name: "telemetry",
        critical: false,
        async run() {
          throw new Error("collector offline");
        },
      },
    ],
  });

  const report = await readiness.check();

  assert.equal(report.status, "degraded");
  assert.deepEqual(report.checks[1], {
    name: "telemetry",
    critical: false,
    status: "error",
    code: "check_failed",
  });
});

test("readiness reports unavailable for a failed critical check", async () => {
  const readiness = createReadinessService({
    now: () => FIXED_NOW,
    checks: [
      {
        name: "database",
        critical: true,
        async run() {
          return { status: "error", code: "connection_refused" };
        },
      },
    ],
  });

  const report = await readiness.check();

  assert.equal(report.status, "unavailable");
  assert.equal(report.checks[0].code, "connection_refused");
});

test("readiness never exposes thrown secrets", async () => {
  const readiness = createReadinessService({
    checks: [
      {
        name: "database",
        async run() {
          throw new Error("postgres://admin:secret@example.internal/db");
        },
      },
    ],
  });

  const serialized = JSON.stringify(await readiness.check());

  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("example.internal"), false);
  assert.equal(serialized.includes("postgres://"), false);
});

test("GET /ready returns 200 for ready and 503 otherwise", async () => {
  const readyApp = createApp({
    readiness: {
      async check() {
        return {
          service: "api-gateway",
          status: "ready",
          checkedAt: FIXED_NOW,
          checks: [],
        };
      },
    },
  });
  const unavailableApp = createApp({
    readiness: {
      async check() {
        return {
          service: "api-gateway",
          status: "unavailable",
          checkedAt: FIXED_NOW,
          checks: [],
        };
      },
    },
  });

  const readyResponse = await readyApp.handleRequest({
    method: "GET",
    url: "/ready",
  });
  const unavailableResponse = await unavailableApp.handleRequest({
    method: "GET",
    url: "/ready",
  });

  assert.equal(readyResponse.status, 200);
  assert.equal(JSON.parse(readyResponse.body).status, "ready");
  assert.equal(unavailableResponse.status, 503);
  assert.equal(JSON.parse(unavailableResponse.body).status, "unavailable");
});
