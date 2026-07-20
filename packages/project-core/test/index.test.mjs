import assert from "node:assert/strict";
import test from "node:test";

import {
  ProjectDomainError,
  assertProjectOperational,
  createMemoryProjectRepository,
  createProjectRecord,
  createProjectService,
  normalizeProjectSlug,
} from "../src/index.mjs";

const at = "2026-07-19T23:30:00.000Z";

function record(overrides = {}) {
  return createProjectRecord({
    id: "project-1",
    tenantId: "tenant-1",
    name: "Projeto Árvore",
    slug: "Projeto Árvore",
    createdAt: at,
    ...overrides,
  });
}

test("normalizes slugs and returns deeply immutable records", () => {
  assert.equal(
    normalizeProjectSlug(" Projeto Árvore / API "),
    "projeto-arvore-api",
  );
  const project = record({ metadata: { flags: { region: "br" } } });
  assert.equal(project.slug, "projeto-arvore");
  assert.throws(() => {
    project.metadata.flags.region = "us";
  }, TypeError);
});

test("repository scopes slug uniqueness by tenant", () => {
  const repository = createMemoryProjectRepository();
  repository.create(record());
  repository.create(record({ id: "project-2", tenantId: "tenant-2" }));

  assert.throws(
    () => repository.create(record({ id: "project-3" })),
    (error) => error.code === "project_slug_conflict",
  );
  assert.equal(
    repository.getByTenantAndSlug("tenant-2", "PROJETO ARVORE").id,
    "project-2",
  );
});

test("service validates tenant and emits lifecycle events", () => {
  let tick = 0;
  const checked = [];
  const service = createProjectService({
    idFactory: () => "project-1",
    clock: () =>
      new Date(Date.parse(at) + tick++ * 1000).toISOString(),
    assertTenantOperational: (tenantId) => {
      checked.push(tenantId);
      return true;
    },
  });

  const created = service.createProject({
    tenantId: "tenant-1",
    name: "Projeto Árvore",
  });
  assert.deepEqual(checked, ["tenant-1"]);
  assert.equal(created.events[0].type, "project.created");
  assert.equal(
    service.activateProject("project-1").events[0].type,
    "project.activated",
  );
  assert.equal(assertProjectOperational(service.getProject("project-1")), true);
  assert.equal(service.suspendProject("project-1").project.status, "suspended");
  assert.equal(
    service.restoreProject("project-1").events[0].type,
    "project.reactivated",
  );
  assert.equal(service.archiveProject("project-1").project.status, "archived");
  assert.equal(
    service.restoreProject("project-1").events[0].type,
    "project.restored",
  );
  assert.equal(service.deleteProject("project-1").project.status, "deleted");
});

test("rejects invalid transitions without mutation", () => {
  const repository = createMemoryProjectRepository({
    initialProjects: [record({ status: "active" })],
  });
  const service = createProjectService({
    repository,
    idFactory: () => "unused",
    clock: () => at,
  });

  assert.throws(
    () => service.activateProject("project-1"),
    (error) =>
      error instanceof ProjectDomainError &&
      error.code === "invalid_project_transition",
  );
  assert.equal(service.getProject("project-1").status, "active");
});

test("lists projects by tenant and status deterministically", () => {
  const repository = createMemoryProjectRepository({
    initialProjects: [
      record({
        id: "project-2",
        slug: "dois",
        status: "active",
        createdAt: "2026-07-19T23:30:02.000Z",
      }),
      record({
        id: "project-1",
        slug: "um",
        status: "archived",
        createdAt: "2026-07-19T23:30:01.000Z",
      }),
      record({
        id: "project-3",
        tenantId: "tenant-2",
        slug: "tres",
        status: "active",
      }),
    ],
  });

  assert.deepEqual(
    repository.listByTenant("tenant-1").map(({ id }) => id),
    ["project-1", "project-2"],
  );
  assert.deepEqual(
    repository
      .listByTenant("tenant-1", { status: "active" })
      .map(({ id }) => id),
    ["project-2"],
  );
});
