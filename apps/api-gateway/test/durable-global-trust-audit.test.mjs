import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createOperationalGateway } from "../src/operational-composition.mjs";

test("persists issued tenant context audit events in the operational store", async () => {
  const directory = await mkdtemp(join(tmpdir(), "api-gateway-audit-"));
  const stateFilePath = join(directory, "state.json");

  try {
    const ids = ["correlation_001", "event_001"];
    const gateway = createOperationalGateway({
      stateFilePath,
      adminKey: "admin-secret",
      adminPrincipal: {
        id: "operator_001",
        tenantId: "tenant_001",
        scopes: ["gateway:read"],
      },
      auditNow: () => "2026-07-28T12:00:00.000Z",
      auditIdFactory: () => ids.shift(),
    });

    const response = await gateway.app.handleRequest({
      method: "GET",
      url: "/v1/whoami",
      headers: { "x-admin-key": "admin-secret", "x-region": "br-south" },
    });

    assert.equal(response.status, 200);

    const state = JSON.parse(await readFile(stateFilePath, "utf8"));
    const event = state.collections.global_trust_audit_events.event_001;

    assert.equal(event.contractType, "AuditEvent");
    assert.equal(event.tenantId, "tenant_001");
    assert.equal(event.actorId, "operator_001");
    assert.equal(event.action, "gateway.tenant_context.issued");
    assert.equal(event.correlationId, "correlation_001");
    assert.equal(event.metadata.region, "br-south");
    assert.equal(event.sensitiveContentIncluded, false);
    assert.equal(JSON.stringify(event).includes("admin-secret"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects duplicate audit event ids instead of overwriting evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "api-gateway-audit-"));
  const stateFilePath = join(directory, "state.json");

  try {
    const gateway = createOperationalGateway({
      stateFilePath,
      adminKey: "admin-secret",
      adminPrincipal: {
        id: "operator_001",
        tenantId: "tenant_001",
        scopes: [],
      },
      auditNow: () => "2026-07-28T12:00:00.000Z",
      auditIdFactory: () => "fixed_id",
    });

    const first = await gateway.app.handleRequest({
      method: "GET",
      url: "/v1/whoami",
      headers: { "x-admin-key": "admin-secret" },
    });
    assert.equal(first.status, 200);

    await assert.rejects(
      () =>
        gateway.app.handleRequest({
          method: "GET",
          url: "/v1/whoami",
          headers: { "x-admin-key": "admin-secret" },
        }),
      /record already exists/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
