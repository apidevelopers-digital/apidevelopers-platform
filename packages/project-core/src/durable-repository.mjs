import { createRepository } from "@apidevelopers/persistence-core";

function assertStore(store) {
  if (!store || typeof store.read !== "function" || typeof store.transact !== "function") {
    throw new TypeError("store must implement read() and transact()");
  }
  return store;
}

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

export function createDurableProjectRepository({ store } = {}) {
  const repository = createRepository({
    store: assertStore(store),
    collection: "projects",
  });

  return Object.freeze({
    kind: "durable",

    async create(project) {
      return clone(await repository.create(project));
    },

    async replace(project) {
      return clone(await repository.replace(project.id, project));
    },

    async getById(id) {
      return clone(await repository.getById(id));
    },

    async getByTenantAndSlug(tenantId, slug) {
      const normalizedTenantId = String(tenantId ?? "").trim();
      const normalizedSlug = String(slug ?? "").trim().toLowerCase();
      const matches = await repository.list({
        where: {
          tenantId: normalizedTenantId,
          slug: normalizedSlug,
        },
        limit: 1,
      });
      return clone(matches[0] ?? null);
    },

    async listByTenant(tenantId, { status } = {}) {
      const where = {
        tenantId: String(tenantId ?? "").trim(),
        ...(status === undefined ? {} : { status }),
      };
      return clone(await repository.list({ where }));
    },
  });
}
