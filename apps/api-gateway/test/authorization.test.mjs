import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/app.mjs";
import { createMemoryAuditLog } from "../src/audit-log.mjs";
import { createClientRegistry } from "../src/client-registry.mjs";
import { createFixedWindowRateLimiter } from "../src/rate-limit.mjs";

function parse(result) {
  return result.body ? JSON.parse(result.body) : null;
}

test("enforces explicit scopes on administrative routes", async () => {
  const clientRegistry = createClientRegistry({
    clock: () => "2026-07-19T12:00:00.000Z",
    clientId: () => "client-1",
    keyId: () => "key-1",
    keyFactory: () => "apid_test_secret_1",
  });

  const app = createApp({
    clientRegistry,
    auditLog: createMemoryAuditLog(),
    adminKey: "admin-test-key",
    requestIdFactory: () => "request-scope-001",
    rateLimiter: createFixedWindowRateLimiter({
      limit: 100,
      windowMs: 60_000,
      clock: () => 1_000,
    }),
    authorizer(identity, { roles, scopes }) {
      const allowed =
        identity.role === "admin" &&
        roles.includes("admin") &&
        scopes.every((scope) => scope === "admin:clients:read");

      return {
        allowed,
        reason: allowed ? null : "scope_forbidden",
        missingScopes: allowed ? [] : [...scopes],
      };
    },
  });

  const headers = { "x-api-key": "admin-test-key" };
  const list = await app.handleRequest({
    method: "GET",
    url: "/v1/admin/clients",
    headers,
  });
  const create = await app.handleRequest({
    method: "POST",
    url: "/v1/admin/clients",
    headers,
    body: {
      name: "Denied Client",
      contactEmail: "denied@example.test",
    },
  });

  assert.equal(list.status, 200);
  assert.equal(create.status, 403);
  assert.equal(parse(create).error, "insufficient_scope");
  assert.deepEqual(parse(create).details.requiredScopes, [
    "admin:clients:write",
  ]);
  assert.equal(clientRegistry.listClients().length, 0);
});
