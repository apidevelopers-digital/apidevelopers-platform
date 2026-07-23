import test from "node:test";
import assert from "node:assert/strict";

import { createAsyncProjectService } from "../src/async-service.mjs";

function createAsyncProjectRepository() {
  const byId = new Map();
  const keyToId = new Map();

  const key = (tenantId, slug) => `${tenantId}:${slug}`;

  return {
    kind: "async-test",

    async create(project) {
      if (byId.has(project.id)) throw new Error("project id already exists");
      const projectKey = key(project.tenantId, project.slug);
      if (keyToId.has(projectKey)) throw new Error("project slug already exists");
      byId.set(project.id, structuredClone(project));
      keyToId.set(projectKey, project.id);
      return structuredClone(project);
    },

    async replace(project) {
      const current = byId.get(project.id);
      if (!current) throw new Error("project not found");
      keyToId.delete(key(current.tenantId, current.slug));
      byId.set(project.id, structuredClone(project));
      keyToId.set(key(project.tenantId, project.slug), project.id);
      return structuredClone(project);
    },

    async getById(id) {
      return byId.has(id) ? structuredClone(byId.get(id)) : null;
    },

    async getByTenantAndSlug(tenantId, slug) {
      const id = keyToId.get(key(tenantId, slug));
      return id ? structuredClone(byId.get(id)) : null;
    },

    async listByTenant(tenantId, { status } = {}) {
      return [...byId.values()]
        .filter((project) =>
          project.tenantId === tenantId &&
          (status === undefined || project.status === status))
        .map((project) => structuredClone(project));
    },
  };
}

test("async project service creates, activates and recovers a project", async () => {
  const service = createAsyncProjectService({
    repository: createAsyncProjectRepository(),
    idFactory: () => "project_001",
    clock: () => "2026-07-22T10:00:00.000Z",
    assertTenantOperational: async () => true,
  });

  const created = await service.createProject({
    tenantId: "tenant_001",
    name: "Core API",
  });

  assert.equal(service.repositoryKind, "async-test");
  assert.equal(created.project.id, "project_001");
  assert.equal(created.project.slug, "core-api");
  assert.equal(created.project.status, "provisioning");
  assert.equal(created.events[0].type, "project.created");

  const activated = await service.activateProject("project_001");
  assert.equal(activated.project.status, "active");
  assert.equal(activated.events[0].type, "project.activated");

  assert.deepEqual(
    await service.getProjectBySlug("tenant_001", "CORE API"),
    activated.project,
  );
  assert.deepEqual(
    await service.listProjects("tenant_001", { status: "active" }),
    [activated.project],
  );
});
