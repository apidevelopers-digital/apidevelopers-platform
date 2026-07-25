import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import {
  createDurableAuditLog,
  createDurableObservabilityApp,
} from "../src/durable-observability.mjs";

function metricsStub() {
  return {
    snapshot() {
      return Object.freeze([
        Object.freeze({
          name: "gateway_requests_total",
          labels: Object.freeze({ route: "/v1/whoami" }),
          value: 3,
        }),
      ]);
    },
  };
}

test("persists sanitized audit events and recovers them after restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "durable-observability-"));
  const filePath = join(directory, "state.json");
  t.after(() => rm(directory, { recursive: true, force: true }));

  const first = createDurableAuditLog({
    store: createJsonFileStore({ filePath }),
    retention: 2,
    idFactory: (() => {
      const ids = ["event-1", "event-2", "event-3"];
      return () => ids.shift();
    })(),
  });

  await first.append({
    type: "gateway.authentication",
    occurredAt: "2026-07-25T10:00:00.000Z",
    route: "/v1/whoami",
    status: 401,
    secret: "must-not-persist",
    headers: { authorization: "must-not-persist" },
  });
  await first.append({
    type: "gateway.authentication",
    occurredAt: "2026-07-25T10:01:00.000Z",
    route: "/v1/whoami",
    status: 200,
  });
  await first.append({
    type: "gateway.rate_limited",
    occurredAt: "2026-07-25T10:02:00.000Z",
    route: "/v1/whoami",
    status: 429,
  });

  const second = createDurableAuditLog({
    store: createJsonFileStore({ filePath }),
    retention: 2,
  });
  const records = await second.list({ limit: 10 });

  assert.equal(records.length, 2);
  assert.deepEqual(records.map((entry) => entry.status), [429, 200]);
  assert.equal(JSON.stringify(records).includes("must-not-persist"), false);
});

test("exports metrics only to identities with observability scope", async () => {
  const events = [];
  const auditLog = {
    async append(event) {
      events.push(event);
      return event;
    },
    async list() {
      return Object.freeze(events.slice().reverse());
    },
  };
  const app = {
    async handleRequest() {
      return {
        status: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "unauthorized" }),
      };
    },
  };

  const identities = new Map([
    ["allowed", {
      role: "client",
      principal: { id: "key-1", scopes: ["observability:read"] },
    }],
    ["forbidden", {
      role: "client",
      principal: { id: "key-2", scopes: ["projects:read"] },
    }],
  ]);
  const authenticator = {
    async authenticate(headers = {}) {
      return identities.get(headers["x-api-key"]) ?? null;
    },
  };

  const observable = createDurableObservabilityApp({
    app,
    authenticator,
    metrics: metricsStub(),
    auditLog,
  });

  const unauthorized = await observable.handleRequest({
    method: "GET",
    url: "/v1/metrics",
    headers: {},
  });
  assert.equal(unauthorized.status, 401);

  const forbidden = await observable.handleRequest({
    method: "GET",
    url: "/v1/metrics",
    headers: { "x-api-key": "forbidden" },
  });
  assert.equal(forbidden.status, 403);

  const allowed = await observable.handleRequest({
    method: "GET",
    url: "/v1/metrics",
    headers: { "x-api-key": "allowed" },
  });
  assert.equal(allowed.status, 200);
  assert.equal(JSON.parse(allowed.body).metrics[0].value, 3);
});

test("awaits durable audit persistence for protected requests", async () => {
  let persisted = false;
  const observable = createDurableObservabilityApp({
    app: {
      async handleRequest() {
        return {
          status: 401,
          headers: { "content-type": "application/json" },
          body: "{}",
        };
      },
    },
    authenticator: { async authenticate() { return null; } },
    metrics: metricsStub(),
    auditLog: {
      async append() {
        await new Promise((resolve) => setTimeout(resolve, 5));
        persisted = true;
      },
      async list() { return []; },
    },
  });

  await observable.handleRequest({
    method: "GET",
    url: "/v1/whoami",
  });
  assert.equal(persisted, true);
});
