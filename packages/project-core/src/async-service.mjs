import {
  ProjectDomainError,
  createProjectRecord,
  normalizeProjectSlug,
} from "./index.mjs";

const transitions = Object.freeze({
  provisioning: ["active", "deleted"],
  active: ["suspended", "archived", "deleted"],
  suspended: ["active", "archived", "deleted"],
  archived: ["active", "deleted"],
  deleted: [],
});

const transitionEvents = Object.freeze({
  "provisioning:active": "project.activated",
  "provisioning:deleted": "project.deleted",
  "active:suspended": "project.suspended",
  "active:archived": "project.archived",
  "active:deleted": "project.deleted",
  "suspended:active": "project.reactivated",
  "suspended:archived": "project.archived",
  "suspended:deleted": "project.deleted",
  "archived:active": "project.restored",
  "archived:deleted": "project.deleted",
});

function required(value, name) {
  const result = String(value ?? "").trim();
  if (!result) {
    throw new ProjectDomainError("invalid_argument", `${name} is required`);
  }
  return result;
}

function assertAsyncRepository(repository) {
  for (const method of [
    "create",
    "replace",
    "getById",
    "getByTenantAndSlug",
    "listByTenant",
  ]) {
    if (typeof repository?.[method] !== "function") {
      throw new ProjectDomainError(
        "invalid_repository",
        `repository.${method} must be a function`,
      );
    }
  }
  return repository;
}

function immutable(value) {
  return Object.freeze(structuredClone(value));
}

export function createAsyncProjectService({
  repository,
  idFactory,
  clock = () => new Date().toISOString(),
  assertTenantOperational = async () => true,
} = {}) {
  const projects = assertAsyncRepository(repository);

  if (typeof idFactory !== "function") {
    throw new ProjectDomainError(
      "invalid_argument",
      "idFactory must be a function",
   );
  }

  if (typeof assertTenantOperational !== "function") {
    throw new ProjectDomainError(
      "invalid_argument",
      "assertTenantOperational must be a function",
    );
  }

  const now = () => {
    const value = required(clock(), "clock result");
    if (Number.isNaN(Date.parse(value))) {
      throw new ProjectDomainError(
        "invalid_argument",
        "clock result must be an ISO date",
      );
    }
    return value;
  };

  const getRequired = async (projectId) => {
    const normalizedProjectId = required(projectId, "projectId");
    const project = await projects.getById(normalizedProjectId);
    if (!project) {
      throw new ProjectDomainError("project_not_found", "project not found", {
        details: { projectId: normalizedProjectId },
      });
    }
    return project;
  };

  const transition = async (projectId, nextStatus) => {
    const current = await getRequired(projectId);
    if (!(transitions[current.status] ?? []).includes(nextStatus)) {
      throw new ProjectDomainError(
        "invalid_project_transition",
        `project cannot transition from ${current.status} to ${nextStatus}`,
        {
          details: {
            projectId: current.id,
            from: current.status,
            to: nextStatus,
          },
        },
      );
    }

    const updatedAt = now();
    const project = await projects.replace(
      createProjectRecord({
        ...current,
        status: nextStatus,
        updatedAt,
      }),
    );

    return immutable({
      project,
      events: [{
        type: transitionEvents[`${current.status}:${nextStatus}`],
        projectId: project.id,
        tenantId: project.tenantId,
        occurredAt: updatedAt,
        data: {
          previousStatus: current.status,
          status: project.status,
        },
      }],
    });
  };

  return Object.freeze({
    repositoryKind: repository.kind ?? "custom",

    async createProject({
      tenantId,
      name,
      slug,
      metadata = {},
    }) {
      const normalizedTenantId = required(tenantId, "tenantId");
      await assertTenantOperational(normalizedTenantId);
      const createdAt = now();
      const project = await projects.create(
        createProjectRecord({
          id: required(idFactory(), "idFactory result"),
          tenantId: normalizedTenantId,
          name,
          slug: slug ?? name,
          status: "provisioning",
          metadata,
          createdAt,
        }),
      );

      return immutable({
        project,
        events: [{
          type: "project.created",
          projectId: project.id,
          tenantId: project.tenantId,
          occurredAt: createdAt,
          data: {
            status: project.status,
            slug: project.slug,
          },
        }],
      });
    },

    activateProject: (id) => transition(id, "active"),
    suspendProject: (id) => transition(id, "suspended"),
    archiveProject: (id) => transition(id, "archived"),
    restoreProject: (id) => transition(id, "active"),
    deleteProject: (id) => transition(id, "deleted"),
    getProject: getRequired,

    async getProjectBySlug(tenantId, slug) {
      return projects.getByTenantAndSlug(
        required(tenantId, "tenantId"),
        normalizeProjectSlug(slug),
      );
    },

    async listProjects(tenantId, filters) {
      return projects.listByTenant(required(tenantId, "tenantId"), filters);
    },
  });
}
