import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createGatewayAuthenticator } from "../src/auth-composition.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function createRepository(records) {
  const calls = [];

  return {
    calls,
    async getActiveByPrefix(tenantId, prefix) {
      calls.push({ tenantId, prefix });
      return (
        records.find(
          (record) =>
            record.tenantId === tenantId &&
            record.prefix === prefix &&
            record.status === "active",
        ) ?? null
      );
    },
  };
}

test("gateway composition authenticates a tenant-bound durable API key", async () => {
  const secret = "apid_gateway_secret_1234567890";
  const repository = createRepository([
    {
      id: "key_001",
      tenantId: "tenant_001",
      name: "Gateway",
      prefix: secret.slice(0, 12),
      hash: sha256(secret),
      scopes: ["gateway:read"],
      status: "active",
    },
  ]);
  const authenticator = createGatewayAuthenticator({
    apiKeyRepository: repository,
  });

  const identity = await authenticator.authenticate({
    "x-tenant-id": "tenant_001",
    "x-api-key": secret,
  });

  assert.equal(identity.role, "client");
  assert.equal(identity.principal.id, "key_001");
  assert.equal(identity.principal.tenantId, "tenant_001");
  assert.equal("hash" in identity.principal, false);
  assert.deepEqual(repository.calls, [
    {
      tenantId: "tenant_001",
      prefix: secret.slice(0, 12),
    },
  ]);
});

test("gateway composition rejects cross-tenant and tampered credentials", async () => {
  const secret = "apid_gateway_secret_1234567890";
  const repository = createRepository([
    {
      id: "key_001",
      tenantId: "tenant_001",
      name: "Gateway",
      prefix: secret.slice(0, 12),
      hash: sha256(secret),
      scopes: [],
      status: "active",
    },
  ]);
  const authenticator = createGatewayAuthenticator({
    apiKeyRepository: repository,
  });

  assert.equal(
    await authenticator.authenticate({
      "x-tenant-id": "tenant_002",
      "x-api-key": secret,
    }),
    null,
  );
  assert.equal(
    await authenticator.authenticate({
      "x-tenant-id": "tenant_001",
      "x-api-key": `${secret}_tampered`,
    }),
    null,
  );
});

test("gateway composition validates its durable repository contract", () => {
  assert.throws(
    () => createGatewayAuthenticator({ apiKeyRepository: {} }),
    /apiKeyRepository\.getActiveByPrefix must be a function/,
  );
});
