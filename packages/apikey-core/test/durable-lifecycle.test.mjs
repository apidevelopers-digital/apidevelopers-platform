import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createDurableApiKeyRepository } from "../src/durable-repository.mjs";
import { createApiKeyLifecycleService } from "../src/lifecycle-service.mjs";

test("durable API key lifecycle isolates tenants and rotates atomically", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "apikey-durable-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const store = createJsonFileStore({
    filePath: join(directory, "state.json"),
    clock: () => "2026-07-23T10:00:00.000Z",
    idFactory: () => "test-write",
  });
  const repository = createDurableApiKeyRepository({ store });

  const ids = ["key_001", "key_002"];
  const secrets = [
    { secret: "ak_live_first", prefix: "ak_live_fir", keyHash: "hash_1" },
    { secret: "ak_live_second", prefix: "ak_live_sec", keyHash: "hash_2" },
  ];

  const service = createApiKeyLifecycleService({
    repository,
    idFactory: () => ids.shift(),
    clock: () => "2026-07-23T10:00:00.000Z",
    generateKey: () => secrets.shift(),
    assertTenantOperational: async () => true,
  });

  const issued = await service.issueApiKey({
    tenantId: "tenant_001",
    name: "Primary",
    scopes: ["projects:read"],
  });

  assert.equal(service.repositoryKind, "durable");
  assert.equal(issued.apiKey.id, "key_001");
  assert.equal(issued.apiKey.tenantId, "tenant_001");
  assert.equal(issued.apiKey.status, "active");
  assert.equal(issued.secret, "ak_live_first");
  assert.equal(issued.events[0].type, "apikey.issued");

  const found = await service.findActiveByPrefix("tenant_001", "ak_live_fir");
  assert.equal(found.id, "key_001");
  assert.equal(await service.findActiveByPrefix("tenant_002", "ak_live_fir"), null);

  await assert.rejects(
    service.rotateApiKey({
      tenantId: "tenant_002",
      apiKeyId: "key_001",
    }),
    /not found for tenant/,
  );

  const rotated = await service.rotateApiKey({
    tenantId: "tenant_001",
    apiKeyId: "key_001",
  });

  assert.equal(rotated.previous.status, "revoked");
  assert.equal(rotated.previous.revocationReason, "rotated");
  assert.equal(rotated.apiKey.id, "key_002");
  assert.equal(rotated.apiKey.status, "active");
  assert.equal(rotated.secret, "ak_live_second");
  assert.equal(rotated.events[0].type, "apikey.rotated");

  const active = await service.listApiKeys("tenant_001", { status: "active" });
  const revoked = await service.listApiKeys("tenant_001", { status: "revoked" });
  assert.deepEqual(active.map((record) => record.id), ["key_002"]);
  assert.deepEqual(revoked.map((record) => record.id), ["key_001"]);

  const revokedResult = await service.revokeApiKey({
    tenantId: "tenant_001",
    apiKeyId: "key_002",
    reason: "operator_request",
  });

  assert.equal(revokedResult.apiKey.status, "revoked");
  assert.equal(revokedResult.apiKey.revocationReason, "operator_request");
  assert.equal(revokedResult.events[0].type, "apikey.revoked");
  assert.equal(await service.findActiveByPrefix("tenant_001", "ak_live_sec"), null);
});
