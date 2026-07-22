import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createDurableProjectRepository } from "../src/durable-repository.mjs";

test("durable project repository preserves and recovers projects", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "project-durable-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const filePath = join(directory, "state.json");
  const store = createJsonFileStore({
    filePath,
    clock: () => "2026-07-22T10:00:00.000Z",
    idFactory: () => "test-write",
  });

  const repository = createDurableProjectRepository({ store });

  const project = {
    id: "project_001",
    tenantId: "tenant_001",
    name: "Core API",
    slug: "core-api",
    status: "provisioning",
    metadata: {},
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z",
  };

  await repository.create(project);

  assert.deepEqual(await repository.getById("project_001"), project);
  assert.deepEqual(
    await repository.getByTenantAndSlug("tenant_001", "CORE-API"),
    project,
  );
  assert.deepEqual(
    await repository.listByTenant("tenant_001", { status: "provisioning" }),
    [project],
  );

  const recovered = createDurableProjectRepository({
    store: createJsonFileStore({ filePath }),
  });

  assert.deepEqual(await recovered.getById("project_001"), project);
  assert.deepEqual(
    await recovered.getByTenantAndSlug("tenant_001", "core-api"),
    project,
  );
});
