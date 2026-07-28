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

test("returns only audit events from the authenticated tenant with authorization evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "audit-query-authz-"));
  try {
    const ids = ["corr_a", "event_a", "decision_a", "corr_b", "event_b", "decision_b"];
    const common = {
      stateFilePath: join(directory, "state.json"),
      auditNow: () => "2026-07-28T12:00:00.000Z",
      auditIdFactory: () => ids.shift(),
      authorizationNow: () => "2026-07-28T12:00:01.000Z",
      authorizationIdFactory: () => ids.shift(),
    };
    const gatewayA = createOperationalGateway({
      ...common,
      adminKey: "admin-a",
      adminPrincipal: { id: "actor_a", tenantId: "tenant_a", scopes: ["audit:read"] },
    });
    await gatewayA.app.handleRequest({
      method: "GET",
      url: "/v1/whoami",
      headers: { "x-api-key": "admin-a" },
    });

    const gatewayB = createOperationalGateway({
      ...common,
      adminKey: "admin-b",
      adminPrincipal: { id: "actor_b", tenantId: "tenant_b", scopes: ["audit:read"] },
    });
    await gatewayB.app.handleRequest({
      method: "GET",
      url: "/v1/whoami",
      headers: { "x-api-key": "admin-b" },
    });

    const response = await gatewayA.app.handleRequest(request({ "x-api-key": "admin-a" }));
    assert.equal(response.status, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.tenantId, "tenant_a");
    assert.equal(body.count, 1);
    assert.equal(body.events[0].tenantId, "tenant_a");
    assert.equal(body.authorizationDecision.contractType, "AuthorizationDecision");
    assert.equal(body.authorizationDecision.effect, "allow");
    assert.equal(JSON.stringify(body).includes("tenant_b"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("denies audit queries when audit:read scope is missing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "audit-query-authz-"));
  try {
    const gateway = createOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "admin",
      adminPrincipal: { id: "actor", tenantId: "tenant", scopes: [] },
      authorizationNow: () => "2026-07-28T12:00:00.000Z",
      authorizationIdFactory: () => "decision_deny",
    });

    const response = await gateway.app.handleRequest(request({ "x-api-key": "admin" }));
    assert.equal(response.status, 403);
    const body = JSON.parse(response.body);
    assert.equal(body.error, "forbidden");
    assert.equal(body.authorizationDecision.effect, "deny");
    assert.deepEqual(body.authorizationDecision.reasonCodes, ["missing_scope:audit:read"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("requires authentication and tenant context", async () => {
  const directory = await mkdtemp(join(tmpdir(), "audit-query-authz-"));
  try {
    const gateway = createOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "admin",
      adminPrincipal: { id: "actor", scopes: ["audit:read"] },
    });

    const unauthorized = await gateway.app.handleRequest(request({}));
    assert.equal(unauthorized.status, 401);

    const missingTenant = await gateway.app.handleRequest(request({ "x-api-key": "admin" }));
    assert.equal(missingTenant.status, 403);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
