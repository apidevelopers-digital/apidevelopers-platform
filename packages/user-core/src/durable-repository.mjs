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

export function createDurableUserRepository({ store } = {}) {
  const repository = createRepository({
    store: assertStore(store),
    collection: "users",
  });

  return Object.freeze({
    kind: "durable",

    async create(user) {
      return clone(await repository.create(user));
    },

    async replace(user) {
      return clone(await repository.replace(user.id, user));
    },

    async getById(id) {
      return clone(await repository.getById(id));
    },

    async getByEmail(email) {
      const normalizedEmail = String(email ?? "").trim().toLowerCase();
      const matches = await repository.list({
        where: { email: normalizedEmail },
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
