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

export function createDurableTenantRepository({ store } = {}) {
  const repository = createRepository({
    store: assertStore(store),
    collection: "tenants",
  });

  return Object.freeze({
    kind: "durable",

    async create(tenant) {
      return clone(await repository.create(tenant));
    },

    async replace(tenant) {
      return clone(await repository.replace(tenant.id, tenant));
    },

    async getById(id) {
      return clone(await repository.getById(id));
    },

    async getBySlug(slug) {
      const matches = await repository.list({
        where: { slug },
        limit: 1,
      });
      return clone(matches[0] ?? null);
    },

    async list({ status } = {}) {
      const where = status === undefined ? undefined : { status };
      return clone(await repository.list({ where }));
    },
  });
}
