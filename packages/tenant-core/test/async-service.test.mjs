import test from "node:test";
import assert from "node:assert/strict";

import { createAsyncTenantService } from "../src/async-service.mjs";

function createAsyncTenantRepository() {
  const byId = new Map();
  const bySlug = new Map();

  return {
    kind: "async-test",
    async create(tenant) {
      if (byId.has(tenant.id)) throw new Error("tenant id already exists");
      if (bySlug.has(tenant.slug)) throw new Error("tenant slug already exists");
      byId.set(tenant.id, structuredClone(tenant));
      bySlug.set(tenant.slug, tenant.id);
      return structuredClone(tenant);
    },
    async replace(tenant) {
      if (!byId.has(tenant.id)) throw new Error("tenant not found");
      byId.set(tenant.id, structuredClone(tenant));
      bySlug.set(tenant.slug, tenant.id);
      return structuredClone(tenant);
    },
    async getById(id) {
      return byId.has(id) ? structuredClone(byId.get(id)) : null;
    },
    async getBySlug(slug) {
      const id = bySlug.get(slug);
      return id ? structuredClone(byId.get(id)) : null;
    },
    async list({ status } = {}) {
      return [...byId.values()]
        .filter((tenant) => status === undefined || tenant.status === status)
        .map(structuredClone);
    },
  };
}

test("async tenant service provisions and recovers a tenant through an async repository", async () => {
  const service = createAsyncTenantService({
    repository: createAsyncTenantRepository(),
    idFactory: () => "tenant_001",
    clock: () => "2026-07-22T04:00:00.000Z",
  });

  const created = await service.provisionTenant({
    name: "API Developers Digital",
    ownerUserId: "user_001",
  });

  assert.equal(service.repositoryKind, "async-test");
  assert.equal(created.tenant.id, "tenant_001");
  assert.equal(created.tenant.slug, "api-developers-digital");
  assert.equal(created.tenant.status, "provisioning");
  assert.equal(created.events[0].type, "tenant.provisioned");

  assert.deepEqual(await service.getTenant("tenant_001"), created.tenant);
  assert.deepEqual(
    await service.getTenantBySlug("api-developers-digital"),
    created.tenant,
  );
  assert.deepEqual(await service.listTenants(), [created.tenant]);
});
