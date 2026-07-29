import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createOperationalGatewayWithReadiness,
  createOperationalReadinessService,
  createPersistenceReadinessCheck,
  createReadinessHttpApp,
} from "../src/operational-readiness-composition.mjs";

const FIXED_NOW = "2026-07-29T14:30:00.000Z";

test("persistence readiness verifies a readable revision", async () => {
  const check = createPersistenceReadinessCheck({
    store: {
      async read() {
        return { revision: 7 };
      },
    },
  });

  assert.deepEqual(await check.run(), {
    status: "ok",
    code: "readable",
  });
});

test("persistence readiness rejects an invalid revision", async () => {
  const check = createPersistenceReadinessCheck({
    store: {
      async read() {
        return { revision: -1 };
      },
    },
  });

  assert.deepEqual(await check.run(), {
    status: "error",
    code: "invalid_revision",
  });
});

test("operational readiness suppresses persistence error details", async () => {
  const readiness = createOperationalReadinessService({
    now: () => FIXED_NOW,
    store: {
      async read() {
        throw new Error("postgres://admin:secret@example.internal/database");
      },
    },
  });

  const serialized = JSON.stringify(await readiness.check());

  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("example.internal"), false);
  assert.equal(serialized.includes("postgres://"), false);

  const report = JSON.parse(serialized);
  assert.equal(report.status, "unavailable");
  assert.deepEqual(report.checks[0], {
    name: "persistence",
    critical: true,
    status: "error",
    code: "check_failed",
  });
});

test("readiness HTTP app intercepts /ready and delegates other routes", async () => {
  const delegated = [];
  const app = createReadinessHttpApp({
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
    app: {
      async handleRequest(request) {
        delegated.push(request.url);
        return {
          status: 204,
          headers: {},
          body: "",
        };
      },
    },
  });

  const readyResponse = await app.handleRequest({
    method: "GET",
    url: "/ready",
  });
  const delegatedResponse = await app.handleRequest({
    method: "GET",
    url: "/health",
  });

  assert.equal(readyResponse.status, 200);
  assert.equal(JSON.parse(readyResponse.body).status, "ready");
  assert.equal(delegatedResponse.status, 204);
  assert.deepEqual(delegated, ["/health"]);
});

test("operational gateway wires readiness to its real file store", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "api-gateway-readiness-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const gateway = createOperationalGatewayWithReadiness({
    stateFilePath: join(directory, "state.json"),
    readinessNow: () => FIXED_NOW,
  });

  const response = await gateway.app.handleRequest({
    method: "GET",
    url: "/ready",
  });
  const report = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(report.status, "ready");
  assert.equal(report.checkedAt, FIXED_NOW);
  assert.deepEqual(report.checks, [
    {
      name: "persistence",
      critical: true,
      status: "ok",
      code: "readable",
    },
  ]);
});
