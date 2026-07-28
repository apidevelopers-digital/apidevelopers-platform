import { randomUUID } from "node:crypto";

import {
  assertModelDescriptorContract,
  createModelDescriptor,
} from "@apidevelopers/contracts";

import {
  MODEL_REGISTRY_EVENT_COLLECTION,
  createGlobalTrustModelRegistryIntegrity,
} from "./global-trust-model-registry-integrity.mjs";

const MODEL_STATUSES = new Set(["candidate", "approved", "suspended", "retired"]);
const TRANSITIONS = Object.freeze({
  candidate: new Set(["approved", "suspended", "retired"]),
  approved: new Set(["suspended", "retired"]),
  suspended: new Set(["approved", "retired"]),
  retired: new Set(),
});

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function normalizeLocales(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("allowedLocales must be a non-empty array");
  }
  return [...new Set(values.map((value, index) =>
    required(value, `allowedLocales[${index}]`)
  ))].sort();
}

function tenantModelEvents(tx, tenantId, modelId) {
  return tx.list(MODEL_REGISTRY_EVENT_COLLECTION)
    .map(({ value }) => value)
    .filter((event) =>
      event?.tenantId === tenantId
      && (modelId === undefined || event.modelId === modelId)
    )
    .sort((left, right) =>
      left.revision - right.revision
      || left.eventId.localeCompare(right.eventId)
    );
}

function currentDescriptor(events) {
  return events.at(-1)?.descriptor ?? null;
}

function assertHumanOperator(identity, tenantId) {
  const principal = identity?.principal ?? {};
  const actorId = required(principal.id, "identity.principal.id");
  if (principal.kind !== "human") {
    throw new ModelRegistryError(
      "human_operator_required",
      "only a human principal may change the model registry",
      403,
    );
  }
  if (required(principal.tenantId, "identity.principal.tenantId") !== tenantId) {
    throw new ModelRegistryError(
      "tenant_mismatch",
      "operator tenant must match the model registry tenant",
      403,
    );
  }
  return actorId;
}

function publicEvent(event) {
  return Object.freeze({
    contractType: event.contractType,
    contractVersion: event.contractVersion,
    eventId: event.eventId,
    tenantId: event.tenantId,
    modelId: event.modelId,
    revision: event.revision,
    eventType: event.eventType,
    previousEventId: event.previousEventId,
    reasonCode: event.reasonCode,
    changedBy: event.changedBy,
    changedAt: event.changedAt,
    correlationId: event.correlationId,
    descriptor: event.descriptor,
    sensitiveContentIncluded: false,
  });
}

export class ModelRegistryError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "ModelRegistryError";
    this.code = code;
    this.status = status;
  }
}

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
    async register({
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
    } = {}) {
      const tenantId = required(identity?.principal?.tenantId, "identity.principal.tenantId");
      const changedBy = assertHumanOperator(identity, tenantId);
      const normalizedModelId = required(modelId, "modelId");
      const normalizedCorrelationId = required(correlationId, "correlationId");
      const changedAt = required(now(), "changedAt");

      const descriptor = createModelDescriptor({
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
      assertModelDescriptorContract(descriptor);

      const transaction = await store.transaction((tx) => {
        const existing = tenantModelEvents(tx, tenantId, normalizedModelId);
        if (existing.length) {
          throw new ModelRegistryError(
            "model_already_registered",
            "modelId is already registered for this tenant",
            409,
          );
        }

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
          changedAt,
          correlationId: normalizedCorrelationId,
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
        return publicEvent(event);
      });

      return transaction.result;
    },

    async transition({
      identity,
      modelId,
      status,
      reasonCode,
      correlationId,
    } = {}) {
      const tenantId = required(identity?.principal?.tenantId, "identity.principal.tenantId");
      const changedBy = assertHumanOperator(identity, tenantId);
      const normalizedModelId = required(modelId, "modelId");
      const targetStatus = required(status, "status");
      if (!MODEL_STATUSES.has(targetStatus)) {
        throw new ModelRegistryError(
          "invalid_model_status",
          "status must be candidate, approved, suspended, or retired",
          400,
        );
      }
      const normalizedReason = required(reasonCode, "reasonCode");
      const normalizedCorrelationId = required(correlationId, "correlationId");
      const changedAt = required(now(), "changedAt");

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
        if (*!TRANSITIONS[current.status]?.has(targetStatus)) {
          throw new ModelRegistryError(
            "invalid_status_transition",
            `model status cannot transition from ${current.status} to ${targetStatus}`,
            409,
          );
        }

        const descriptor = createModelDescriptor({
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
        assertModelDescriptorContract(descriptor);

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
          reasonCode: normalizedReason,
          changedBy,
          changedAt,
          correlationId: normalizedCorrelationId,
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
    },

    async get({ tenantId, modelId } = {}) {
      const tenant = required(tenantId, "tenantId");
      const normalizedModelId = required(modelId, "modelId");
      const transaction = await store.transaction((tx) => {
        const descriptor = currentDescriptor(
          tenantModelEvents(tx, tenant, normalizedModelId),
        );
        return descriptor;
      });
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
