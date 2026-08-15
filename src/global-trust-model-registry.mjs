import { randomUUID } from "node:crypto";

import {
  MODEL_REGISTRY_EVENT_COLLECTION,
  createGlobalTrustModelRegistryIntegrity,
} from "./global-trust-model-registry-integrity.mjs";
import { ModelRegistryError } from "./global-trust-model-registry-shared.mjs";
import { createModelRegistryReader } from "./global-trust-model-registry-read.mjs";
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

  return Object.freeze({
    ...createModelRegistryWriter({ store, integrity, eventIdFactory, now }),
    ...createModelRegistryReader(store),
  });
}
