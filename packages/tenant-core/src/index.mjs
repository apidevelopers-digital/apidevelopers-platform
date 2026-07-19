export const TENANT_STATUSES = Object.freeze(["provisioning","active","restricted","suspended","cancelled"]);

export class TenantDomainError extends Error {
  constructor(code, message, { details = {}, cause } = {}) {
    super(message, { cause });
    this.name = "TenantDomainError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

const transitions = Object.freeze({
  provisioning: ["active","cancelled"],
  active: ["restricted","suspended","cancelled"],
  restricted: ["active","suspended","cancelled"],
  suspended: ["active","cancelled"],
  cancelled: ["active"],
});

const transitionEvents = Object.freeze({
  "provisioning:active": "tenant.activated",
  "provisioning:cancelled": "tenant.cancelled",
  "active:restricted": "tenant.restricted",
  "active:suspended": "tenant.suspended",
  "active:cancelled": "tenant.cancelled",
  "restricted:active": "tenant.reactivated",
  "restricted:suspended": "tenant.suspended",
  "restricted:cancelled": "tenant.cancelled",
  "suspended:active": "tenant.reactivated",
  "suspended:cancelled": "tenant.cancelled",
  "cancelled:active": "tenant.reactivated",
});

function required(value, name) {
  const result = String(value ?? "").trim();
  if (!result) throw new TenantDomainError("invalid_argument", `${name} is required`);
  return result;
}

function immutable(value) {
  const copy = structuredClone(value);
  for (const nested of Object.values(copy)) {
    if (nested && typeof nested === "object") Object.freeze(nested);
  }
  return Object.freeze(copy);
}

export function normalizeTenantSlug(value) {
  const slug = required(value, "slug")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
  if (slug.length < 3 || slug.length > 63) {
    throw new TenantDomainError("invalid_tenant_slug", "tenant slug must contain between 3 and 63 characters", { details: { slug } });
  }
  return slug;
}

export function createTenantRecord({
  id, name, slug, ownerUserId, status = "provisioning",
  metadata = {}, createdAt, updatedAt = createdAt,
}) {
  if (!TENANT_STATUSES.includes(status)) {
    throw new TenantDomainError("invalid_tenant_status", "tenant status is not supported", { details: { status } });
  }
  for (const [value, label] of [[createdAt,"createdAt"],[updatedAt,"updatedAt"]]) {
    if (Number.isNaN(Date.parse(required(value, label)))) {
      throw new TenantDomainError("invalid_argument", `${label} must be an ISO date`);
    }
  }
  return immutable({
    id: required(id, "id"),
    name: required(name, "name"),
    slug: normalizeTenantSlug(slug ?? name),
    ownerUserId: required(ownerUserId, "ownerUserId"),
    status,
    metadata: structuredClone(metadata),
    createdAt,
    updatedAt,
  });
}

export function createMemoryTenantRepository({ initialTenants = [] } = {}) {
  const byId = new Map();
  const slugToId = new Map();

  function store(input, replace = false) {
    const tenant = createTenantRecord(input);
    const existing = byId.get(tenant.id);
    const slugOwner = slugToId.get(tenant.slug);
    if (!replace && existing) throw new TenantDomainError("tenant_id_conflict", "tenant id already exists");
    if (slugOwner && slugOwner !== tenant.id) throw new TenantDomainError("tenant_slug_conflict", "tenant slug already exists");
    if (replace && !existing) throw new TenantDomainError("tenant_not_found", "tenant not found");
    if (existing && existing.slug !== tenant.slug) slugToId.delete(existing.slug);
    byId.set(tenant.id, tenant);
    slugToId.set(tenant.slug, tenant.id);
    return immutable(tenant);
  }

  initialTenants.forEach((tenant) => store(tenant));

  return Object.freeze({
    kind: "memory",
    create: (tenant) => store(tenant),
    replace: (tenant) => store(tenant, true),
    getById: (id) => byId.has(required(id,"tenantId")) ? immutable(byId.get(id)) : null,
    getBySlug: (slug) => {
      const id = slugToId.get(normalizeTenantSlug(slug));
      return id ? immutable(byId.get(id)) : null;
    },
    list: ({ status } = {}) => [...byId.values()]
      .filter((tenant) => status === undefined || tenant.status === status)
      .sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map(immutable),
  });
}

function assertRepository(repository) {
  for (const method of ["create","replace","getById","getBySlug","list"]) {
    if (typeof repository?.[method] !== "function") {
      throw new TenantDomainError("invalid_repository", `repository.${method} must be a function`);
    }
  }
  return repository;
}

export function assertTenantOperational(tenant) {
  if (tenant?.status !== "active") {
    throw new TenantDomainError("tenant_not_operational", "tenant is not active", { details: { tenantId: tenant?.id, status: tenant?.status } });
  }
  return true;
}

export function createTenantService({
  repository = createMemoryTenantRepository(),
  idFactory,
  clock = () => new Date().toISOString(),
} = {}) {
  const tenants = assertRepository(repository);
  if (typeof idFactory !== "function") throw new TenantDomainError("invalid_argument", "idFactory must be a function");

  const now = () => {
    const value = required(clock(), "clock result");
    if (Number.isNaN(Date.parse(value))) throw new TenantDomainError("invalid_argument", "clock result must be an ISO date");
    return value;
  };

  const getRequired = (tenantId) => {
    const tenant = tenants.getById(tenantId);
    if (!tenant) throw new TenantDomainError("tenant_not_found", "tenant not found", { details: { tenantId } });
    return tenant;
  };

  function transition(tenantId, nextStatus) {
    const current = getRequired(tenantId);
    if (!(transitions[current.status] ?? []).includes(nextStatus)) {
      throw new TenantDomainError("invalid_tenant_transition", `tenant cannot transition from ${current.status} to ${nextStatus}`, {
        details: { tenantId: current.id, from: current.status, to: nextStatus },
      });
    }
    const tenant = tenants.replace(createTenantRecord({ ...current, status: nextStatus, updatedAt: now() }));
    return immutable({
      tenant,
      events: [{
        type: transitionEvents[`${current.status}:${nextStatus}`],
        tenantId: tenant.id,
        occurredAt: tenant.updatedAt,
        data: { previousStatus: current.status, status: tenant.status },
      }],
    });
  }

  return Object.freeze({
    repositoryKind: repository.kind ?? "custom",
    provisionTenant({ name, slug, ownerUserId, metadata = {} }) {
      const createdAt = now();
      const tenant = tenants.create(createTenantRecord({
        id: required(idFactory(), "idFactory result"),
        name, slug: slug ?? name, ownerUserId, metadata,
        status: "provisioning", createdAt,
      }));
      return immutable({
        tenant,
        events: [{ type: "tenant.provisioned", tenantId: tenant.id, occurredAt: tenant.createdAt, data: { previousStatus: null, status: tenant.status } }],
      });
    },
    activateTenant: (id) => transition(id, "active"),
    restrictTenant: (id) => transition(id, "restricted"),
    suspendTenant: (id) => transition(id, "suspended"),
    cancelTenant: (id) => transition(id, "cancelled"),
    reactivateTenant: (id) => transition(id, "active"),
    getTenant: getRequired,
    getTenantBySlug: (slug) => tenants.getBySlug(slug),
    listTenants: (filters) => tenants.list(filters),
  });
}
