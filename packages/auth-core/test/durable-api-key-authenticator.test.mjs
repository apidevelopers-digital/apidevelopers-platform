import assert from "node:assert/strict";
import test from "node:test";

import { hashApiKey } from "@apidevelopers/apikey-core";

import {
  createDurableApiKeyAuthenticator,
  resolveTenantIdFromHeaders,
} from "../src/durable-api-key-authenticator.mjs";

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

test("resolves tenant id from normalized headers", () => {
  assert.equal(
    resolveTenantIdFromHeaders({ "X-Tenant-ID": " tenant_001 " }),
    "tenant_001",
  );
  assert.equal(resolveTenantIdFromHeaders({}), null);
});

test("authenticates an active durable API key inside its tenant boundary", async () => {
  const secret = "apid_tenant_secret_1234567890";
  const repository = createRepository([
    {
      id: "key_001",
      tenantId: "tenant_001",
      name: "Primary",
      prefix: secret.slice(0, 12),
      hash: hashApiKey(secret),
      scopes: ["projects:read"],
      status: "active",
    },
  ]);
  const authenticator = createDurableApiKeyAuthenticator({ repository });

  const identity = await authenticator.authenticate({
    "x-tenant-id": "tenant_001",
    "x-api-key": secret,
  });

  assert.equal(identity.role, "client");
  assert.deepEqual(identity.principal, {
    id: "key_001",
    tenantId: "tenant_001",
    name: "Primary",
    prefix: secret.slice(0, 12),
    scopes: ["projects:read"],
    status: "active",
  });
  assert.equal("hash" in identity.principal, false);
  assert.equal("keyHash" in identity.principal, false);
  assert.equal(Object.isFrozen(identity), true);
  assert.equal(Object.isFrozen(identity.principal), true);
  assert.deepEqual(repository.calls, [
    { tenantId: "tenant_001", prefix: secret.slice(0, 12) },
  ]);
});

test("rejects missing tenant, cross-tenant lookup and invalid hash", async () => {
  const secret = "apid_shared_prefix_valid_secret";
  const record = {
    id: "key_001",
    tenantId: "tenant_001",
    name: "Primary",
    prefix: secret.slice(0, 12),
    hash: hashApiKey(secret),
    scopes: [],
    status: "active",
  };
  const repository = createRepository([record]);
  const authenticator = createDurableApiKeyAuthenticator({ repository });

  assert.equal(
    await authenticator.authenticate({ "x-api-key": secret }),
    null,
  );
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

test("preserves admin precedence without consulting the durable repository", async () => {
  const repository = createRepository([]);
  const authenticator = createDurableApiKeyAuthenticator({
    repository,
    adminKey: "admin-secret-value",
  });

  const identity = await authenticator.authenticate({
    "x-api-key": "admin-secret-value",
  });

  assert.equal(identity.role, "admin");
  assert.equal(identity.principal.id, "platform-admin");
  assert.equal(repository.calls.length, 0);
});

test("validates the durable repository contract", () => {
  assert.throws(
    () => createDurableApiKeyAuthenticator({ repository: {} }),
    /getActiveByPrefix/,
  );
});
