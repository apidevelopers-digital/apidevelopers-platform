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

test("gateway composition rejects cross-tenant and tampered durable credentials", async () => {
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

test("gateway composition authenticates delegated, operator and ADA Mitra service keys with bounded scopes", async () => {
  const repository = createRepository([]);
  const delegatedKey = "delegate-secret-1234567890";
  const operatorKey = "operator-secret-1234567890-abcdefghi";
  const adaMitraMcpReadKey = "ada-mitra-read-secret-1234567890-abcdef";

  const authenticator = createGatewayAuthenticator({
    apiKeyRepository: repository,
    delegatedKey,
    delegatedTenantId: "tenant_uni_co",
    operatorKey,
    operatorTenantId: "tenant_institutional_operator",
    adaMitraMcpReadKey,
    adaMitraMcpReadTenantId: "tenant:institution",
  });

  const delegated = await authenticator.authenticate({
    authorization: `Bearer ${delegatedKey}`,
  });
  assert.equal(delegated.role, "service");
  assert.equal(delegated.principal.id, "backend-delegated");
  assert.equal(delegated.principal.tenantId, "tenant_uni_co");
  assert.deepEqual(delegated.principal.scopes, ["saas:access:delegate"]);

  const operator = await authenticator.authenticate({
    authorization: `Bearer ${operatorKey}`,
  });
  assert.equal(operator.role, "service");
  assert.equal(operator.principal.id, "institutional-operator");
  assert.equal(operator.principal.tenantId, "tenant_institutional_operator");
  assert.deepEqual(operator.principal.scopes, ["operator:resource:read"]);

  const adaMitra = await authenticator.authenticate({
    "x-api-key": adaMitraMcpReadKey,
  });
  assert.equal(adaMitra.role, "service");
  assert.equal(adaMitra.principal.id, "ada-mitra-mcp-v1-read");
  assert.equal(adaMitra.principal.tenantId, "tenant:institution");
  assert.deepEqual(adaMitra.principal.scopes, ["ada:mitra:read"]);

  for (const identity of [delegated, operator, adaMitra]) {
    assert.equal(identity.principal.status, "active");
    assert.equal(identity.principal.scopes.includes("admin:*"), false);
    assert.deepEqual(Object.keys(identity.principal).includes("hash"), false);
  }
  assert.deepEqual(repository.calls, []);
});

test("gateway composition keeps service keys fail-closed and falls back to durable auth", async () => {
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
    operatorKey: "operator-secret-1234567890-abcdefghi",
    operatorTenantId: "tenant_institutional_operator",
    adaMitraMcpReadKey: "ada-mitra-read-secret-1234567890-abcdef",
    adaMitraMcpReadTenantId: "tenant:institution",
  });

  assert.equal(
    await authenticator.authenticate({
      authorization: "Bearer delegate-secret-tampered",
    }),
    null,
  );
  assert.equal(
    await authenticator.authenticate({
      authorization: "Bearer operator-secret-tampered",
    }),
    null,
  );
  assert.equal(
    await authenticator.authenticate({
      "x-api-key": "ada-mitra-read-secret-tampered",
    }),
    null,
  );

  const durableIdentity = await authenticator.authenticate({
    "x-tenant-id": "tenant_001",
    "x-api-key": durableSecret,
  });
  assert.equal(durableIdentity.principal.id, "key_001");
});

test("gateway composition requires service key and tenant id pairs together", () => {
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
  assert.throws(
    () =>
      createGatewayAuthenticator({
        apiKeyRepository: repository,
        operatorKey: "operator-secret-1234567890-abcdefghi",
      }),
    /API_GATEWAY_OPERATOR_KEY and API_GATEWAY_OPERATOR_TENANT_ID must be configured together/,
  );
  assert.throws(
    () =>
      createGatewayAuthenticator({
        apiKeyRepository: repository,
        operatorTenantId: "tenant_institutional_operator",
      }),
    /API_GATEWAY_OPERATOR_KEY and API_GATEWAY_OPERATOR_TENANT_ID must be configured together/,
  );
  assert.throws(
    () =>
      createGatewayAuthenticator({
        apiKeyRepository: repository,
        adaMitraMcpReadKey: "ada-mitra-read-secret-1234567890-abcdef",
      }),
    /ADA_MITRA_MCP_V1_READ_TOKEN and ADA_MITRA_BRIDGE_TENANT_ID must be configured together/,
  );
  assert.throws(
    () =>
      createGatewayAuthenticator({
        apiKeyRepository: repository,
        adaMitraMcpReadTenantId: "tenant:institution",
      }),
    /ADA_MITRA_MCP_V1_READ_TOKEN and ADA_MITRA_BRIDGE_TENANT_ID must be configured together/,
  );
});

test("gateway composition rejects weak scoped service keys", () => {
  const repository = createRepository([]);

  assert.throws(
    () =>
      createGatewayAuthenticator({
        apiKeyRepository: repository,
        operatorKey: "too-short",
        operatorTenantId: "tenant_institutional_operator",
      }),
    /API_GATEWAY_OPERATOR_KEY must contain at least 32 characters/,
  );

  assert.throws(
    () =>
      createGatewayAuthenticator({
        apiKeyRepository: repository,
        adaMitraMcpReadKey: "too-short",
        adaMitraMcpReadTenantId: "tenant:institution",
      }),
    /ADA_MITRA_MCP_V1_READ_TOKEN must contain at least 32 characters/,
  );
});

test("gateway composition rejects credential reuse across configured service roles", () => {
  const repository = createRepository([]);
  const shared = "shared-service-secret-1234567890-abcdef";

  assert.throws(
    () =>
      createGatewayAuthenticator({
        apiKeyRepository: repository,
        delegatedKey: shared,
        delegatedTenantId: "tenant_uni_co",
        operatorKey: shared,
        operatorTenantId: "tenant_institutional_operator",
      }),
    /delegated and operator keys must be distinct/,
  );

  assert.throws(
    () =>
      createGatewayAuthenticator({
        apiKeyRepository: repository,
        operatorKey: shared,
        operatorTenantId: "tenant_institutional_operator",
        adaMitraMcpReadKey: shared,
        adaMitraMcpReadTenantId: "tenant:institution",
      }),
    /operator and ada-mitra-mcp-read keys must be distinct/,
  );

  assert.throws(
    () =>
      createGatewayAuthenticator({
        apiKeyRepository: repository,
        adminKey: shared,
        adaMitraMcpReadKey: shared,
        adaMitraMcpReadTenantId: "tenant:institution",
      }),
    /admin and ada-mitra-mcp-read keys must be distinct/,
  );
});
