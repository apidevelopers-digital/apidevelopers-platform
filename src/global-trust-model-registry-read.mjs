import {
  MODEL_STATUSES,
  currentDescriptor,
  publicEvent,
  required,
  tenantModelEvents,
} from "./global-trust-model-registry-shared.mjs";

export function createModelRegistryReader(store) {
  return Object.freeze({
    async get({ tenantId, modelId } = {}) {
      const tenant = required(tenantId, "tenantId");
      const id = required(modelId, "modelId");
      const transaction = await store.transaction((tx) =>
        currentDescriptor(tenantModelEvents(tx, tenant, id))
      );
      return transaction.result;
    },

    async list({ tenantId, status, limit = 100 } = {}) {
      const tenant = required(tenantId, "tenantId");
      const normalizedLimit = Number(limit);
      if (!Number.isInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 500) {
        throw new RangeError("limit must be an integer between 1 and 500");
      }
      if (status !== undefined && !MODEL_STATUSES.has(String(status))) {
        throw new TypeError("status is invalid");
      }
      const transaction = await store.transaction((tx) => {
        const grouped = new Map();
        for (const event of tenantModelEvents(tx, tenant)) {
          grouped.set(event.modelId, event.descriptor);
        }
        return [...grouped.values()]
          .filter((descriptor) => status === undefined || descriptor.status === status)
          .sort((left, right) => left.modelId.localeCompare(right.modelId))
          .slice(0, normalizedLimit);
      });
      return Object.freeze(transaction.result);
    },

    async history({ tenantId, modelId } = {}) {
      const tenant = required(tenantId, "tenantId");
      const id = required(modelId, "modelId");
      const transaction = await store.transaction((tx) =>
        tenantModelEvents(tx, tenant, id).map(publicEvent)
      );
      return Object.freeze(transaction.result);
    },
  });
}
