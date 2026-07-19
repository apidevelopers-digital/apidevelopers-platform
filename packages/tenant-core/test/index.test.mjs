import assert from "node:assert/strict";
import test from "node:test";
import {
  TenantDomainError, assertTenantOperational, createMemoryTenantRepository,
  createTenantRecord, createTenantService, normalizeTenantSlug,
} from "../src/index.mjs";

const at = "2026-07-19T20:00:00.000Z";
const record = (overrides = {}) => createTenantRecord({
  id: "tenant-1", name: "Empresa Árvore", slug: "Empresa Árvore",
  ownerUserId: "user-1", createdAt: at, ...overrides,
});

test("normalizes slugs and returns immutable records", () => {
  assert.equal(normalizeTenantSlug(" Empresa Árvore / Sul "), "empresa-arvore-sul");
  const tenant = record({ metadata: { region: "br" } });
  assert.equal(tenant.slug, "empresa-arvore");
  assert.throws(() => { tenant.metadata.region = "us"; }, TypeError);
});

test("repository protects id and slug uniqueness", () => {
  const repository = createMemoryTenantRepository();
  repository.create(record());
  assert.throws(() => repository.create(record()), (error) => error.code === "tenant_id_conflict");
  assert.throws(
    () => repository.create(record({ id: "tenant-2", ownerUserId: "user-2" })),
    (error) => error.code === "tenant_slug_conflict",
  );
  assert.equal(repository.getBySlug("EMPRESA ÁRVORE").id, "tenant-1");
});

test("service advances lifecycle and emits events", () => {
  let tick = 0;
  const service = createTenantService({
    idFactory: () => "tenant-1",
    clock: () => new Date(Date.parse(at) + tick++ * 1000).toISOString(),
  });
  const provisioned = service.provisionTenant({ name: "Empresa Árvore", ownerUserId: "user-1" });
  assert.equal(provisioned.events[0].type, "tenant.provisioned");
  const activated = service.activateTenant("tenant-1");
  assert.equal(activated.events[0].type, "tenant.activated");
  assert.equal(assertTenantOperational(activated.tenant), true);
  assert.equal(service.suspendTenant("tenant-1").events[0].type, "tenant.suspended");
  assert.equal(service.reactivateTenant("tenant-1").events[0].type, "tenant.reactivated");
  assert.equal(service.cancelTenant("tenant-1").tenant.status, "cancelled");
  assert.equal(service.reactivateTenant("tenant-1").tenant.status, "active");
});

test("rejects invalid transitions without mutation", () => {
  const repository = createMemoryTenantRepository({ initialTenants: [record({ status: "active" })] });
  const service = createTenantService({ repository, idFactory: () => "unused", clock: () => at });
  assert.throws(
    () => service.activateTenant("tenant-1"),
    (error) => error instanceof TenantDomainError && error.code === "invalid_tenant_transition",
  );
  assert.equal(service.getTenant("tenant-1").status, "active");
});

test("filters tenants deterministically", () => {
  const repository = createMemoryTenantRepository({ initialTenants: [
    record({ id: "tenant-2", slug: "tenant-dois", status: "active", createdAt: "2026-07-19T20:00:02.000Z" }),
    record({ id: "tenant-1", slug: "tenant-um", status: "suspended", createdAt: "2026-07-19T20:00:01.000Z" }),
  ]});
  assert.deepEqual(repository.list().map(({ id }) => id), ["tenant-1","tenant-2"]);
  assert.deepEqual(repository.list({ status: "active" }).map(({ id }) => id), ["tenant-2"]);
});
