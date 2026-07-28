import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createOperationalGateway } from "../src/operational-composition.mjs";

function request(headers, query = "") {
  return {
    method: "GET",
    url: `/v1/audit-events${query}`,
    headers,
  };
}

test("returns only audit events from the authenticated tenant", async () => {
  const directory = await mkdtemp(join(tmpdir(), "audit-query-"));
  try {
    const ids = [
      "corr_a", "event_a",
      "corr_b", "event_b",
    ];
    const gateway = createOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "admin-a",
      adminPrincipal: { id: "actor_a", tenantId: "tenant_a", scopes: [] },
      auditNow: () => "2026-07-28T12:00:00.000Z",
      auditIdFactory: () => ids.shift(),
    });

    await gateway.app.handleRequest({
      method: "GET",
      url: "/v1/whoami",
      headers: { "x-api-key": "admin-a" },
    });

    const secondGateway = createOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "admin-b",
      adminPrincipal: { id: "actor_b", tenantId: "tenant_b", scopes: [] },
      auditNow: () => "2026-07-28T13:00:00.000Z",
      auditIdFactory: () => ids.shift(),
    });

    await secondGateway.app.handleRequest({
      method: "GET",
      url: "/v1/whoami",
      headers: { "x-api-key": "admin-b" },
    });

    const response = await gateway.app.handleRequest(request({ "x-api-key": "admin-a" }));
    assert.equal(response.status, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.tenantId, "tenant_a");
    assert.equal(body.count, 1);
    assert.equal(body.events[0].tenantId, "tenant_a");
    assert.equal(JSON.stringify(body).includes("tenant_b"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("filters by correlation and rejects invalid limits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "audit-query-"));
  try {
    const ids = ["corr_001", "event_001"];
    const gateway = createOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "admin",
      adminPrincipal: { id: "actor", tenantId: "tenant", scopes: [] },
      auditNow: () => "2026-07-28T12:00:00.000Z",
      auditIdFactory: () => ids.shift(),
    });

    await gateway.app.handleRequest({
      method: "GET",
      url: "/v1/whoami",
      headers: { "x-api-key": "admin" },
    });

    const filtered = await gateway.app.handleRequest(
      request({ "x-api-key": "admin" }, "?correlationId=corr_001&limit=1"),
    );
    assert.equal(filtered.status, 200);
    assert.equal(JSON.parse(filtered.body).count, 1);

    const invalid = await gateway.app.handleRequest(
      request({ "x-api-key": "admin" }, "?limit=201"),
    );
    assert.equal(invalid.status, 400);
    assert.equal(JSON.parse(invalid.body).error, "invalid_query");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("requires authentication and tenant context", async () => {
  const directory = await mkdtemp(join(tmpdir(), "audit-query-"));
  try {
    const gateway = createOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "admin",
      adminPrincipal: { id: "actor", scopes: [] },
    });

    const unauthorized = await gateway.app.handleRequest(request({}));
    assert.equal(unauthorized.status, 401);

    const missingTenant = await gateway.app.handleRequest(request({ "x-api-key": "admin" }));
    assert.equal(missingTenant.status, 403);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
