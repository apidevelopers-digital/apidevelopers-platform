import { randomUUID } from "node:crypto";

import {
  MODDREGISTRY_EVENT_COLLECTION,
  createGlobalTrustModelRegistryIntegrity,
} from "./global-trust-model-registry-integrity.mjs";
import {
  MODEL_STATUSES,
  ModelRegistryError,
  currentDescriptor,
  publicEvent,
  required,
  tenantModelEvents,
} from "./global-trust-model-registry-shared.mjs";
import { createModelRegistryWriter } from "./global-trust-model-registry-write.mjs";

export { MODEL_REGISTRY_EVENT_COLLECTION, ModelRegistryError };

export function createGlobalTrustModelRegistry({
  store,
  integrity = createGlobalTrustModelRegistryIntegrity({ store }),
  eventIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction is required");
  }
  if (typeof integrity?.appendInTransaction !== "function") {
    throw new TypeError("integrity.appendInTransaction is required");
  }
  if (typeof eventIdFactory !== "function") {
    throw new TypeError("eventIdFactory is required");
  }
  if (typeof now !== "function") throw new TypeError("now is required");

  const writer = createModelRegistryWriter({
    store,
    integrity,
    eventIdFactory,
    now,
  });

  return Object.freeze({
    ...writer,

    async get({ tenantId, modelId } = {}) {
      const tenant = required(tenantId, "tenantId");
      const normalizedModelId = required(modelId, "modelId");
      const transaction = await store.transaction((tx) =>
        currentDescriptor(tenantModelEvents(tx, tenant, normalizedModelId))
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
      const normalizedModelId = required(modelId, "modelId");
      const transaction = await store.transaction((tx) =>
        tenantModelEvents(tx, tenant, normalizedModelId).map(publicEvent)
      );
      return Object.freeze(transaction.result);
    },
  });
}
