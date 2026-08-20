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

test("gateway composition authenticates the dedicated delegated backend key with minimum scope", async () => {
  const repository = createRepository([]);
  const authenticator = createGatewayAuthenticator({
    apiKeyRepository: repository,
    delegatedKey: "delegate-secret-1234567890",
    delegatedTenantId: "tenant_uni_co",
  });

  const identity = await authenticator.authenticate({
    authorization: "Bearer delegate-secret-1234567890",
  });

  assert.equal(identity.role, "service");
  assert.equal(identity.principal.id, "backend-delegated");
  assert.equal(identity.principal.tenantId, "tenant_uni_co");
  assert.equal(identity.principal.status, "active");
  assert.deepEqual(identity.principal.scopes, ["saas:access:delegate"]);
  assert.equal(identity.principal.scopes.includes("admin:*"), false);
  assert.deepEqual(repository.calls, []);
});

test("gateway composition keeps delegated backend key fail-closed and falls back to durable auth", async () => {
  const durableSecret = "apid_gateway_secret_1234567890";
  const repository = createRepository([
    {
      id: "key_001",
      tenantId: "tenant_001",
      name: "Gateway",
      prefix: durableSecret.slice(0, 12),
      hash: sha256(durableSecret),
      scopes: ["gateway:read"],
      status: "active",
    },
  ]);
  const authenticator = createGatewayAuthenticator({
    apiKeyRepository: repository,
    delegatedKey: "delegate-secret-1234567890",
    delegatedTenantId: "tenant_uni_co",
  });

  assert.equal(
    await authenticator.authenticate({
      authorization: "Bearer delegate-secret-tampered",
    }),
    null,
  );

  const durableIdentity = await authenticator.authenticate({
    "x-tenant-id": "tenant_001",
    "x-api-key": durableSecret,
  });
  assert.equal(durableIdentity.principal.id, "key_001");
});

test("gateway composition requires delegated key and tenant id together", () => {
  const repository = createRepository([]);

  assert.throws(
    () =>
      createGatewayAuthenticator({
        apiKeyRepository: repository,
        delegatedKey: "delegate-secret-1234567890",
      }),
    /API_GATEWAY_DELEGATED_KEY and API_GATEWAY_DELEGATED_TENANT_ID must be configured together/,
  );

  assert.throws(
    () =>
      createGatewayAuthenticator({
        apiKeyRepository: repository,
        delegatedTenantId: "tenant_uni_co",
      }),
    /API_GATEWAY_DELEGATED_KEY and API_GATEWAY_DELEGATED_TENANT_ID must be configured together/,
  );
});
