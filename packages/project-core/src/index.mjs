export const PROJECT_STATUSES = Object.freeze([
  "provisioning",
  "active",
  "suspended",
  "archived",
  "deleted",
]);

export class ProjectDomainError extends Error {
  constructor(code, message, { details = {}, cause } = {}) {
    super(message, { cause });
    this.name = "ProjectDomainError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

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

function iso(value, name) {
  const result = required(value, name);
  if (Number.isNaN(Date.parse(result))) {
    throw new ProjectDomainError("invalid_argument", `${name} must be an ISO date`);
  }
  return result;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function immutable(value) {
  return deepFreeze(structuredClone(value));
}

export function normalizeProjectSlug(value) {
  const slug = required(value, "slug")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (slug.length < 2 || slug.length > 63) {
    throw new ProjectDomainError(
      "invalid_project_slug",
      "project slug must contain between 2 and 63 characters",
      { details: { slug } },
    );
  }
  return slug;
}

export function createProjectRecord({
  id,
  tenantId,
  name,
  slug,
  status = "provisioning",
  metadata = {},
  createdAt,
  updatedAt = createdAt,
}) {
  if (!PROJECT_STATUSES.includes(status)) {
    throw new ProjectDomainError(
      "invalid_project_status",
      "project status is not supported",
      { details: { status } },
    );
  }

  return immutable({
    id: required(id, "id"),
    tenantId: required(tenantId, "tenantId"),
    name: required(name, "name"),
    slug: normalizeProjectSlug(slug ?? name),
    status,
    metadata,
    createdAt: iso(createdAt, "createdAt"),
    updatedAt: iso(updatedAt, "updatedAt"),
  });
}

function projectKey(tenantId, slug) {
  return `${required(tenantId, "tenantId")}:${normalizeProjectSlug(slug)}`;
}

export function createMemoryProjectRepository({ initialProjects = [] } = {}) {
  const byId = new Map();
  const keyToId = new Map();

  function store(input, replace = false) {
    const project = createProjectRecord(input);
    const existing = byId.get(project.id);
    const key = projectKey(project.tenantId, project.slug);
    const keyOwner = keyToId.get(key);

    if (!replace && existing) {
      throw new ProjectDomainError("project_id_conflict", "project id already exists");
    }
    if (keyOwner && keyOwner !== project.id) {
      throw new ProjectDomainError(
        "project_slug_conflict",
        "project slug already exists for this tenant",
      );
    }
    if (replace && !existing) {
      throw new ProjectDomainError("project_not_found", "project not found");
    }

    if (existing) keyToId.delete(projectKey(existing.tenantId, existing.slug));
    byId.set(project.id, project);
    keyToId.set(key, project.id);
    return immutable(project);
  }

  initialProjects.forEach((project) => store(project));

  return Object.freeze({
    kind: "memory",
    create: (project) => store(project),
    replace: (project) => store(project, true),
    getById(id) {
      const project = byId.get(required(id, "projectId"));
      return project ? immutable(project) : null;
    },
    getByTenantAndSlug(tenantId, slug) {
      const id = keyToId.get(projectKey(tenantId, slug));
      return id ? immutable(byId.get(id)) : null;
    },
    listByTenant(tenantId, { status } = {}) {
      const normalizedTenantId = required(tenantId, "tenantId");
      return [...byId.values()]
        .filter((project) =>
          project.tenantId === normalizedTenantId &&
          (status === undefined || project.status === status))
        .sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map(immutable);
    },
  });
}

function assertRepository(repository) {
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

export function assertProjectOperational(project) {
  if (project?.status !== "active") {
    throw new ProjectDomainError(
      "project_not_operational",
      "project is not active",
      { details: { projectId: project?.id, status: project?.status } },
    );
  }
  return true;
}

export function createProjectService({
  repository = createMemoryProjectRepository(),
  idFactory,
  clock = () => new Date().toISOString(),
  assertTenantOperational = () => true,
} = {}) {
  const projects = assertRepository(repository);
  if (typeof idFactory !== "function") {
    throw new ProjectDomainError("invalid_argument", "idFactory must be a function");
  }
  if (typeof assertTenantOperational !== "function") {
    throw new ProjectDomainError(
      "invalid_argument",
      "assertTenantOperational must be a function",
    );
  }

  const now = () => iso(clock(), "clock result");

  const getRequired = (projectId) => {
    const project = projects.getById(projectId);
    if (!project) {
      throw new ProjectDomainError(
        "project_not_found",
        "project not found",
        { details: { projectId } },
      );
    }
    return project;
  };

  function transition(projectId, nextStatus) {
    const current = getRequired(projectId);
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
    const project = projects.replace(createProjectRecord({
      ...current,
      status: nextStatus,
      updatedAt,
    }));

    return immutable({
      project,
      events: [{
        type: transitionEvents[`${current.status}:${nextStatus}`],
        projectId: project.id,
        tenantId: project.tenantId,
        occurredAt: updatedAt,
        data: { previousStatus: current.status, status: project.status },
      }],
    });
  }

  return Object.freeze({
    repositoryKind: repository.kind ?? "custom",
    createProject({ tenantId, name, slug, metadata = {} }) {
      const normalizedTenantId = required(tenantId, "tenantId");
      assertTenantOperational(normalizedTenantId);
      const createdAt = now();
      const project = projects.create(createProjectRecord({
        id: required(idFactory(), "idFactory result"),
        tenantId: normalizedTenantId,
        name,
        slug: slug ?? name,
        status: "provisioning",
        metadata,
        createdAt,
      }));

      return immutable({
        project,
        events: [{
          type: "project.created",
          projectId: project.id,
          tenantId: project.tenantId,
          occurredAt: createdAt,
          data: { status: project.status, slug: project.slug },
        }],
      });
    },
    activateProject: (id) => transition(id, "active"),
    suspendProject: (id) => transition(id, "suspended"),
    archiveProject: (id) => transition(id, "archived"),
    restoreProject: (id) => transition(id, "active"),
    deleteProject: (id) => transition(id, "deleted"),
    getProject: getRequired,
    getProjectBySlug: (tenantId, slug) =>
      projects.getByTenantAndSlug(tenantId, slug),
    listProjects: (tenantId, filters) =>
      projects.listByTenant(tenantId, filters),
  });
}
