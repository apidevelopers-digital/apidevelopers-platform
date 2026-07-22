import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createDurableTenantRepository } from "../src/durable-repository.mjs";

test("durable tenant repository preserves and recovers tenants", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "tenant-durable-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const filePath = join(directory, "state.json");
  const store = createJsonFileStore({
    filePath,
    clock: () => "2026-07-22T10:00:00.000Z",
    idFactory: () => "test-write",
  });

  const repository = createDurableTenantRepository({ store });

  const tenant = {
    id: "tenant_001",
    name: "API Developers Digital",
    slug: "api-developers-digital",
    ownerUserId: "user_001",
    status: "provisioning",
    metadata: {},
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z",
  };

  await repository.create(tenant);

  assert.deepEqual(await repository.getById("tenant_001"), tenant);
  assert.deepEqual(
    await repository.getBySlug("api-developers-digital"),
    tenant,
  );
  assert.deepEqual(
    await repository.list({ status: "provisioning" }),
    [tenant],
  );

  const recovered = createDurableTenantRepository({
    store: createJsonFileStore({ filePath }),
  });

  assert.deepEqual(await recovered.getById("tenant_001"), tenant);
});
