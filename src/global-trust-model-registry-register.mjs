import { MODEL_REGISTRY_EVENT_COLLECTION } from "./global-trust-model-registry-integrity.mjs";
import {
  ModelRegistryError,
  assertHumanOperator,
  createDescriptor,
  normalizeLocales,
  publicEvent,
  required,
  tenantModelEvents,
} from "./global-trust-model-registry-shared.mjs";

export function createModelRegistryRegister({ store, integrity, eventIdFactory, now }) {
  return async function register(input = {}) {
    const {
      identity,
      modelId,
      provider,
      model,
      version,
      purpose,
      dataPolicyId,
      allowedLocales,
      reasonCode = "initial_registration",
      correlationId,
    } = input;
    const tenantId = required(identity?.principal?.tenantId, "identity.principal.tenantId");
    const changedBy = assertHumanOperator(identity, tenantId);
    const normalizedModelId = required(modelId, "modelId");
    const descriptor = createDescriptor({
      modelId: normalizedModelId,
      tenantId,
      provider: required(provider, "provider"),
      model: required(model, "model"),
      version: required(version, "version"),
      purpose: required(purpose, "purpose"),
      dataPolicyId: required(dataPolicyId, "dataPolicyId"),
      status: "candidate",
      allowedLocales: normalizeLocales(allowedLocales),
    });
    const event = Object.freeze({
      contractType: "ModelRegistryEvent",
      contractVersion: "1.0",
      eventId: required(eventIdFactory(), "eventId"),
      tenantId,
      modelId: normalizedModelId,
      revision: 1,
      eventType: "registered",
      previousEventId: null,
      reasonCode: required(reasonCode, "reasonCode"),
      changedBy,
      changedAt: required(now(), "changedAt"),
      correlationId: required(correlationId, "correlationId"),
      descriptor,
      sensitiveContentIncluded: false,
    });

    const transaction = await store.transaction((tx) => {
      if (tenantModelEvents(tx, tenantId, normalizedModelId).length) {
        throw new ModelRegistryError(
          "model_already_registered",
          "modelId is already registered for this tenant",
          409,
        );
      }
      tx.put(
        MODEL_REGISTRY_EVENT_COLLECTION,
        event.eventId,
        event,
        { ifAbsent: true },
      );
      integrity.appendInTransaction(tx, {
        tenantId,
        sourceCollection: MODEL_REGISTRY_EVENT_COLLECTION,
        recordId: event.eventId,
        payload: event,
      });
      return publicEvent(event);
    });
    return transaction.result;
  };
}
