import { createDurableRepository } from "@apidevelopers/persistence-core";

const COLLECTION = "api_keys";

function assertStore(store) {
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    throw new TypeError("store must implement read() and transaction()");
  }
  return store;
}

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

export function createDurableApiKeyRepository({ store } = {}) {
  const durableStore = assertStore(store);
  const repository = createDurableRepository({
    store: durableStore,
    collection: COLLECTION,
  });

  return Object.freeze({
    kind: "durable",

    async create(record) {
      return clone(await repository.create(record));
    },

    async replace(record) {
      return clone(await repository.replace(record));
    },

    async getById(id) {
      return clone(await repository.getById(requireText(id, "id")));
    },

    async listByTenant(tenantId, { status } = {}) {
      const where = {
        tenantId: requireText(tenantId, "tenantId"),
        ...(status === undefined ? {} : { status }),
      };
      return clone(await repository.list({ where }));
    },

    async getActiveByPrefix(tenantId, prefix) {
      const matches = await repository.list({
        where: {
          tenantId: requireText(tenantId, "tenantId"),
          prefix: requireText(prefix, "prefix"),
          status: "active",
        },
      });
      return clone(matches[0] ?? null);
    },

    async rotate({ previous, current }) {
      if (!previous || !current) throw new TypeError("previous and current records are required");
      if (previous.tenantId !== current.tenantId) {
        throw new Error("API key rotation cannot cross tenant boundaries");
      }

      const committed = await durableStore.transaction((tx) => {
        const stored = tx.get(COLLECTION, previous.id);
        if (!stored) throw new Error("API key record was not found");
        if (stored.tenantId !== previous.tenantId) {
          throw new Error("API key tenant boundary violation");
        }
        if (stored.status !== "active") {
          throw new Error("only active API keys can be rotated");
        }

        tx.put(COLLECTION, previous.id, previous);
        tx.put(COLLECTION, current.id, current, { ifAbsent: true });
        return {
          previous: clone(previous),
          current: clone(current),
        };
      });

      return clone(committed.result);
    },
  });
}
