import {
  PersistenceDomainError,
  clone,
  deepFreeze,
  requireText,
} from "./model.mjs";

export function createDurableRepository({
  store,
  collection,
  idField = "id",
} = {}) {
  if (
    !store ||
    typeof store.read !== "function" ||
    typeof store.transaction !== "function"
  ) {
    throw new PersistenceDomainError(
      "invalid_store",
      "store must provide read and transaction",
    );
  }
  const collectionName = requireText(collection, "collection");
  const identifierField = requireText(idField, "idField");

  const recordId = (record) =>
    requireText(record?.[identifierField], `record.${identifierField}`);

  return Object.freeze({
    kind: `${store.kind ?? "custom"}:${collectionName}`,

    async create(record) {
      const id = recordId(record);
      const committed = await store.transaction((tx) =>
        tx.put(collectionName, id, record, { ifAbsent: true }),
      );
      return committed.result;
    },

    async replace(record, { expectedRevision } = {}) {
      const id = recordId(record);
      const committed = await store.transaction(
        (tx) => {
          if (!tx.get(collectionName, id)) {
            throw new PersistenceDomainError(
              "record_not_found",
              "record was not found",
              { details: { collection: collectionName, id } },
            );
          }
          return tx.put(collectionName, id, record);
        },
        { expectedRevision },
      );
      return committed.result;
    },

    async upsert(record, { expectedRevision } = {}) {
      const id = recordId(record);
      const committed = await store.transaction(
        (tx) => tx.put(collectionName, id, record),
        { expectedRevision },
      );
      return committed.result;
    },

    async getById(id) {
      const state = await store.read();
      const value =
        state.collections?.[collectionName]?.[requireText(id, "id")];
      return value === undefined ? null : deepFreeze(clone(value));
    },

    async list({ where = {} } = {}) {
      const state = await store.read();
      return Object.entries(state.collections?.[collectionName] ?? {})
        .filter(([, record]) =>
          Object.entries(where).every(([key, value]) => record?.[key] === value),
        )
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, record]) => deepFreeze(clone(record)));
    },

    async delete(id, { expectedRevision } = {}) {
      const normalizedId = requireText(id, "id");
      const committed = await store.transaction(
        (tx) => tx.delete(collectionName, normalizedId),
        { expectedRevision },
      );
      return committed.result;
    },
  });
}
