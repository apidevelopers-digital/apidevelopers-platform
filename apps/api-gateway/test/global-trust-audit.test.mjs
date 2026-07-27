import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/server.mjs";
import { createGatewayGlobalTrustAudit } from "../src/global-trust-audit.mjs";

test("records a contract-valid audit event for issued tenant context", async () => {
  const events = [];
  const audit = createGatewayGlobalTrustAudit({
    sink: async (event) => events.push(event),
    now: () => "2026-07-27T12:00:00.000Z",
    idFactory: (() => {
      const ids = ["correlation_001", "event_001"];
      return () => ids.shift();
    })(),
  });
  const app = createApp({
    audit,
    authenticator: {
      async authenticate() {
        return {
          role: "client",
          principal: {
            id: "key_001",
            tenantId: "tenant_001",
            scopes: ["projects:read"],
          },
        };
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/whoami",
    headers: { "x-region": "br-south" },
  });

  assert.equal(response.status, 200);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    contractType: "AuditEvent",
    schemaVersion: "1.0.0",
    eventId: "event_001",
    tenantId: "tenant_001",
    actorId: "key_001",
    action: "gateway.tenant_context.issued",
    resource: "GET /v1/whoami",
    outcome: "success",
    correlationId: "correlation_001",
    occurredAt: "2026-07-27T12:00:00.000Z",
    metadata: {
      route: "/v1/whoami",
      method: "GET",
      region: "br-south",
      isolationMode: "strict",
      scopeCount: 1,
    },
    sensitiveContentIncluded: false,
  });
  assert.equal(Object.isFrozen(events[0]), true);
});

test("propagates the request correlation id without exposing credentials", async () => {
  const events = [];
  const app = createApp({
    audit: createGatewayGlobalTrustAudit({
      sink: async (event) => events.push(event),
      now: () => "2026-07-27T12:00:00.000Z",
      idFactory: () => "event_002",
    }),
    authenticator: {
      async authenticate() {
        return {
          role: "client",
          principal: {
            id: "key_002",
            tenantId: "tenant_002",
            scopes: [],
            secret: "must-not-leak",
          },
        };
      },
    },
  });

  await app.handleRequest({
    method: "GET",
    url: "/v1/whoami",
    headers: {
      "x-correlation-id": "corr_external_001",
      "x-api-key": "must-not-leak",
    },
  });

  assert.equal(events[0].correlationId, "corr_external_001");
  assert.equal(JSON.stringify(events[0]).includes("must-not-leak"), false);
  assert.equal(events[0].sensitiveContentIncluded, false);
});
