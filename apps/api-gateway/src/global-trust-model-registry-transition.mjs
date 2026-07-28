import { MODEL_REGISTRY_EVENT_COLLECTION } from "./global-trust-model-registry-integrity.mjs";
import {
  TRANSITIONS,
  ModelRegistryError,
  assertHumanOperator,
  createDescriptor,
  currentDescriptor,
  publicEvent,
  required,
  tenantModelEvents,
} from "./global-trust-model-registry-shared.mjs";

export function createModelRegistryTransition({ store, integrity, eventIdFactory, now }) {
  return async function transition(input = {}) {
    const { identity, modelId, status, reasonCode, correlationId } = input;
    const tenantId = required(identity?.principal?.tenantId, "identity.principal.tenantId");
    const changedBy = assertHumanOperator(identity, tenantId);
    const normalizedModelId = required(modelId, "modelId");
    const targetStatus = required(status, "status");

    const transaction = await store.transaction((tx) => {
      const events = tenantModelEvents(tx, tenantId, normalizedModelId);
      const current = currentDescriptor(events);
      if (!current) {
        throw new ModelRegistryError(
          "model_not_found",
          "modelId is not registered for this tenant",
          404,
        );
      }
      if (current.status === targetStatus) {
        return Object.freeze({
          changed: false,
          descriptor: current,
          event: publicEvent(events.at(-1)),
        });
      }
      if (!TRANSITIONS[current.status]?.has(targetStatus)) {
        throw new ModelRegistryError(
          "invalid_status_transition",
          `model status cannot transition from ${current.status} to ${targetStatus}`,
          409,
        );
      }

      const descriptor = createDescriptor({
        modelId: current.modelId,
        tenantId: current.tenantId,
        provider: current.provider,
        model: current.model,
        version: current.version,
        purpose: current.purpose,
        dataPolicyId: current.dataPolicyId,
        status: targetStatus,
        allowedLocales: current.allowedLocales,
      });
      const previous = events.at(-1);
      const event = Object.freeze({
        contractType: "ModelRegistryEvent",
        contractVersion: "1.0",
        eventId: required(eventIdFactory(), "eventId"),
        tenantId,
        modelId: normalizedModelId,
        revision: previous.revision + 1,
        eventType: "status_changed",
        previousEventId: previous.eventId,
        reasonCode: required(reasonCode, "reasonCode"),
        changedBy,
        changedAt: required(now(), "changedAt"),
        correlationId: required(correlationId, "correlationId"),
        descriptor,
        sensitiveContentIncluded: false,
      });
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
      return Object.freeze({
        changed: true,
        descriptor,
        event: publicEvent(event),
      });
    });
    return transaction.result;
  };
}
