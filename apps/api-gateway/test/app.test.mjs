import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.mjs";
import { createMemoryAuditLog } from "../src/audit-log.mjs";
import { createClientRegistry } from "../src/client-registry.mjs";
import { createFixedWindowRateLimiter } from "../src/rate-limit.mjs";

function parse(result) {
  return result.body ? JSON.parse(result.body) : null;
}

function fixture({ limit = 100 } = {}) {
  let client = 0;
  let key = 0;
  let secret = 0;
  let audit = 0;

  const clientRegistry = createClientRegistry({
    clock: () => "2026-07-19T12:00:00.000Z",
    clientId: () => `client-${++client}`,
    keyId: () => `key-${++key}`,
    keyFactory: () => `apid_test_secret_${++secret}`,
  });
  const auditLog = createMemoryAuditLog({
    clock: () => "2026-07-19T12:00:00.000Z",
    idFactory: () => `audit-${++audit}`,
  });

  return {
    clientRegistry,
    auditLog,
    app: createApp({
      clientRegistry,
      auditLog,
      adminKey: "admin-test-key",
      requestIdFactory: () => "request-test-001",
      rateLimiter: createFixedWindowRateLimiter({
        limit,
        windowMs: 60_000,
        clock: () => 1_000,
      }),
    }),
  };
}

test("serves health, catalog and OpenAPI publicly", async () => {
  const { app } = fixture();

  const health = await app.handleRequest({ url: "/health" });
  const catalog = await app.handleRequest({ url: "/v1/apis" });
  const openapi = await app.handleRequest({
    url: "/openapi.json",
  });

  assert.equal(health.status, 200);
  assert.equal(parse(health).version, "0.2.0");
  assert.equal(catalog.status, 200);
  assert.ok(parse(catalog).meta.count >= 1);
  assert.equal(openapi.status, 200);
  assert.equal(parse(openapi).openapi, "3.1.0");
});

test("admin creates, rotates and revokes client API Keys", async () => {
  const { app } = fixture();
  const adminHeaders = { "x-api-key": "admin-test-key" };

  const created = await app.handleRequest({
    method: "POST",
    url: "/v1/admin/clients",
    headers: adminHeaders,
    body: {
      name: "Example Client",
      contactEmail: "dev@example.test",
      scopes: ["api:read", "catalog:read"],
    },
  });
  const createdBody = parse(created);

  assert.equal(created.status, 201);
  assert.equal(createdBody.data.id, "client-1");
  assert.equal(createdBody.credentials.apiKey, "apid_test_secret_1");

  const rotated = await app.handleRequest({
    method: "POST",
    url: "/v1/admin/clients/client-1/keys",
    headers: adminHeaders,
    body: { revokeExisting: true },
  });
  const rotatedBody = parse(rotated);

  assert.equal(rotated.status, 201);
  assert.equal(rotatedBody.credentials.apiKey, "apid_test_secret_2");

  const oldIdentity = await app.handleRequest({
    url: "/v1/me",
    headers: { "x-api-key": createdBody.credentials.apiKey },
  });
  const newIdentity = await app.handleRequest({
    url: "/v1/me",
    headers: { "x-api-key": rotatedBody.credentials.apiKey },
  });

  assert.equal(oldIdentity.status, 401);
  assert.equal(newIdentity.status, 200);

  const revoked = await app.handleRequest({
    method: "DELETE",
    url: `/v1/admin/clients/client-1/keys/${rotatedBody.credentials.keyId}`,
    headers: adminHeaders,
  });
  assert.equal(revoked.status, 200);

  const afterRevoke = await app.handleRequest({
    url: "/v1/me",
    headers: { "x-api-key": rotatedBody.credentials.apiKey },
  });
  assert.equal(afterRevoke.status, 401);
});

test("client status and audit routes are administrative", async () => {
  const { app, clientRegistry } = fixture();
  const created = clientRegistry.createClient({
    name: "Read Only",
    contactEmail: "readonly@example.test",
  });

  const forbidden = await app.handleRequest({
    url: "/v1/admin/audit",
    headers: { "x-api-key": created.apiKey },
  });
  assert.equal(forbidden.status, 403);

  const updated = await app.handleRequest({
    method: "PATCH",
    url: `/v1/admin/clients/${created.client.id}`,
    headers: { "x-api-key": "admin-test-key" },
    body: { status: "suspended" },
  });
  assert.equal(updated.status, 200);
  assert.equal(parse(updated).data.status, "suspended");

  const identity = await app.handleRequest({
    url: "/v1/me",
    headers: { "x-api-key": created.apiKey },
  });
  assert.equal(identity.status, 401);

  const audit = await app.handleRequest({
    url: "/v1/admin/audit",
    headers: { "x-api-key": "admin-test-key" },
  });
  assert.equal(audit.status, 200);
  assert.equal(parse(audit).data[0].action, "client.status.update");
  assert.equal(
    JSON.stringify(parse(audit)).includes(created.apiKey),
    false,
  );
});

test("returns 429 with rate limit headers", async () => {
  const { app, clientRegistry } = fixture({ limit: 1 });
  const created = clientRegistry.createClient({
    name: "Limited",
    contactEmail: "limited@example.test",
  });

  const first = await app.handleRequest({
    url: "/v1/me",
    headers: { "x-api-key": created.apiKey },
  });
  const second = await app.handleRequest({
    url: "/v1/me",
    headers: { "x-api-key": created.apiKey },
  });

  assert.equal(first.status, 200);
  assert.equal(first.headers["x-ratelimit-remaining"], "0");
  assert.equal(second.status, 429);
  assert.equal(second.headers["retry-after"], "60");
});
