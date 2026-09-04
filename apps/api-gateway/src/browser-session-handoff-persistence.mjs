const DEFAULT_COLLECTION = "browser-session-handoffs";

function requirePersistenceStore(store) {
  if (!store || typeof store.transaction !== "function") {
    throw new TypeError("persistenceStore.transaction is required");
  }
  return store;
}

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function createPersistenceBackedBrowserSessionHandoffStore({
  persistenceStore,
  collection = DEFAULT_COLLECTION,
} = {}) {
  const store = requirePersistenceStore(persistenceStore);
  const normalizedCollection = requireText(collection, "collection");

  return Object.freeze({
    kind: "persistence-core",
    collection: normalizedCollection,

    async putIfAbsent(key, value) {
      const normalizedKey = requireText(key, "key");

      const committed = await store.transaction(async (tx) => {
        const existing = tx.get(normalizedCollection, normalizedKey);
        if (existing !== null) {
          return false;
        }

        tx.put(normalizedCollection, normalizedKey, value, { ifAbsent: true });
        return true;
      });

      if (!committed || typeof committed.result !== "boolean") {
        throw new TypeError("persistenceStore.transaction must resolve { result }");
      }

      return committed.result;
    },

    async take(key) {
      const normalizedKey = requireText(key, "key");

      const committed = await store.transaction(async (tx) => {
        const existing = tx.get(normalizedCollection, normalizedKey);
        if (existing === null) {
          return null;
        }

        tx.delete(normalizedCollection, normalizedKey);
        return existing;
      });

      if (!committed || !Object.prototype.hasOwnProperty.call(committed, "result")) {
        throw new TypeError("persistenceStore.transaction must resolve { result }");
      }

      return committed.result;
    },
  });
}

export { DEFAULT_COLLECTION as BROWSER_SESSION_HANDOFF_COLLECTION };