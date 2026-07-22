import {
  TenantDomainError,
  createTenantRecord,
} from "./index.mjs";

function required(value, name) {
  const result = String(value ?? "").trim();
  if (!result) {
    throw new TenantDomainError("invalid_argument", `${name} is required`);
  }
  return result;
}

function assertAsyncRepository(repository) {
  for (const method of ["create", "replace", "getById", "getBySlug", "list"]) {
    if (typeof repository?.[method] !== "function") {
      throw new TenantDomainError(
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

export function createAsyncTenantService({
  repository,
  idFactory,
  clock = () => new Date().toISOString(),
} = {}) {
  const tenants = assertAsyncRepository(repository);

  if (typeof idFactory !== "function") {
    throw new TenantDomainError(
      "invalid_argument",
      "idFactory must be a function",
    );
  }

  const now = () => {
    const value = required(clock(), "clock result");
    if (Number.isNaN(Date.parse(value))) {
      throw new TenantDomainError(
        "invalid_argument",
        "clock result must be an ISO date",
      );
    }
    return value;
  };

  const getRequired = async (tenantId) => {
    const tenant = await tenants.getById(required(tenantId, "tenantId"));
    if (!tenant) {
      throw new TenantDomainError("tenant_not_found", "tenant not found", {
        details: { tenantId },
      });
    }
    return tenant;
  };

  return Object.freeze({
    repositoryKind: repository.kind ?? "custom",

    async provisionTenant({
      name,
      slug,
      ownerUserId,
      metadata = {},
    }) {
      const createdAt = now();
      const tenant = await tenants.create(
        createTenantRecord({
          id: required(idFactory(), "idFactory result"),
          name,
          slug: slug ?? name,
          ownerUserId,
          metadata,
          status: "provisioning",
          createdAt,
        }),
      );

      return immutable({
        tenant,
        events: [{
          type: "tenant.provisioned",
          tenantId: tenant.id,
          occurredAt: tenant.createdAt,
          data: {
            previousStatus: null,
            status: tenant.status,
          },
        }],
      });
    },

    getTenant: getRequired,

    async getTenantBySlug(slug) {
      return tenants.getBySlug(slug);
    },

    async listTenants(filters) {
      return tenants.list(filters);
    },
  });
}
