import { randomUUID } from "node:crypto";

import {
  USE_CASE_STATUSES,
  createUseCaseDescriptor,
} from "@apidevelopers/contracts";

import {
  USE_CASE_REGISTRY_EVENT_COLLECTION,
  createGlobalTrustUseCaseRegistryIntegrity,
} from "./global-trust-use-case-registry-integrity.mjs";

const TRANSITIONS = Object.freeze({
  draft: new Set(["approved", "suspended", "retired"]),
  approved: new Set(["suspended", "retired"]),
  suspended: new Set(["approved", "retired"]),
  retired: new Set(),
});

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function normalizeStrings(values, name, { allowEmpty = true } = {}) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new TypeError(
      `${name} must be ${allowEmpty ? "an array" : "a non-empty array"}`,
    );
  }
  return [...new Set(values.map((value, index) =>
    required(value, `${name}[${index}]`)
  ))].sort();
}

function tenantEvents(tx, tenantId, useCaseId) {
  return tx.list(USE_CASE_REGISTRY_EVENT_COLLECTION)
    .map(({ value }) => value)
    .filter((event) =>
      event?.tenantId === tenantId
      && (useCaseId === undefined || event.useCaseId === useCaseId)
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
    throw new UseCaseRegistryError(
      "human_operator_required",
      "only a human principal may change the use case registry",
      403,
    );
  }
  if (
    required(principal.tenantId, "identity.principal.tenantId") !== tenantId
  ) {
    throw new UseCaseRegistryError(
      "tenant_mismatch",
      "operator tenant must match the use case registry tenant",
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
    useCaseId: event.useCaseId,
    revision: event.revision,
    eventType: event.eventType,
    previousEventId: event.previousEventId,
    reasonCode: event.reasonCode,
    changedBy: event.changedBy,
    changedAt: event.changedAt,
    correlationId: event.correlationId,
    descriptor: event.descriptor,
    modelApprovalSnapshot: event.modelApprovalSnapshot,
    sensitiveContentIncluded: false,
  });
}

export class UseCaseRegistryError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "UseCaseRegistryError";
    this.code = code;
    this.status = status;
  }
}

export function createGlobalTrustUseCaseRegistry({
  store,
  modelRegistry,
  integrity = createGlobalTrustUseCaseRegistryIntegrity({ store }),
  eventIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction is required");
  }
  if (typeof modelRegistry?.get !== "function") {
    throw new TypeError("modelRegistry.get is required");
  }
  if (typeof integrity?.appendInTransaction !== "function") {
    throw new TypeError("integrity.appendInTransaction is required");
  }
  if (typeof eventIdFactory !== "function") {
    throw new TypeError("eventIdFactory is required");
  }
  if (typeof now !== "function") throw new TypeError("now is required");

  async function approvedModelsSnapshot(tenantId, modelIds) {
    const snapshot = [];
    for (const modelId of modelIds) {
      const model = await modelRegistry.get({ tenantId, modelId });
      if (!model) {
        throw new UseCaseRegistryError(
          "model_not_registered",
          `model ${modelId} is not registered for this tenant`,
          409,
        );
      }
      if (model.status !== "approved") {
        throw new UseCaseRegistryError(
          "model_not_approved",
          `model ${modelId} is not approved for this tenant`,
          409,
        );
      }
      snapshot.push(Object.freeze({
        modelId: model.modelId,
        status: model.status,
        version: model.version,
        dataPolicyId: model.dataPolicyId,
      }));
    }
    return Object.freeze(snapshot);
  }

  return Object.freeze({
    async register({
      identity,
      useCaseId,
      ownerId,
      purpose,
      dataPolicyId,
      riskLevel,
      allowedModelIds,
      allowedToolIds = [],
      allowedLocales,
      humanApprovalRequired = true,
      reasonCode = "initial_registration",
      correlationId,
    } = {}) {
      const tenantId = required(
        identity?.principal?.tenantId,
        "identity.principal.tenantId",
      );
      const changedBy = assertHumanOperator(identity, tenantId);
      const normalizedUseCaseId = required(useCaseId, "useCaseId");
      const descriptor = createUseCaseDescriptor({
        useCaseId: normalizedUseCaseId,
        tenantId,
        ownerId: required(ownerId, "ownerId"),
        purpose: required(purpose, "purpose"),
        dataPolicyId: required(dataPolicyId, "dataPolicyId"),
        status: "draft",
        riskLevel: required(riskLevel, "riskLevel"),
        allowedModelIds: normalizeStrings(
          allowedModelIds,
          "allowedModelIds",
          { allowEmpty: false },
        ),
        allowedToolIds: normalizeStrings(allowedToolIds, "allowedToolIds"),
        allowedLocales: normalizeStrings(
          allowedLocales,
          "allowedLocales",
          { allowEmpty: false },
        ),
        humanApprovalRequired: Boolean(humanApprovalRequired),
      });

      const event = Object.freeze({
        contractType: "UseCaseRegistryEvent",
        contractVersion: "1.0",
        eventId: required(eventIdFactory(), "eventId"),
        tenantId,
        useCaseId: normalizedUseCaseId,
        revision: 1,
        eventType: "registered",
        previousEventId: null,
        reasonCode: required(reasonCode, "reasonCode"),
        changedBy,
        changedAt: required(now(), "changedAt"),
        correlationId: required(correlationId, "correlationId"),
        descriptor,
        modelApprovalSnapshot: Object.freeze([]),
        sensitiveContentIncluded: false,
      });

      const transaction = await store.transaction((tx) => {
        if (tenantEvents(tx, tenantId, normalizedUseCaseId).length) {
          throw new UseCaseRegistryError(
            "use_case_already_registered",
            "useCaseId is already registered for this tenant",
            409,
          );
        }
        tx.put(
          USE_CASE_REGISTRY_EVENT_COLLECTION,
          event.eventId,
          event,
          { ifAbsent: true },
        );
        integrity.appendInTransaction(tx, {
          tenantId,
          sourceCollection: USE_CASE_REGISTRY_EVENT_COLLECTION,
          recordId: event.eventId,
          payload: event,
        });
        return publicEvent(event);
      });

      return transaction.result;
    },

    async transition({
      identity,
      useCaseId,
      status,
      reasonCode,
      correlationId,
    } = {}) {
      const tenantId = required(
        identity?.principal?.tenantId,
        "identity.principal.tenantId",
      );
      const changedBy = assertHumanOperator(identity, tenantId);
      const normalizedUseCaseId = required(useCaseId, "useCaseId");
      const targetStatus = required(status, "status");
      if (!USE_CASE_STATUSES.includes(targetStatus)) {
        throw new UseCaseRegistryError(
          "invalid_use_case_status",
          "status must be draft, approved, suspended, or retired",
          400,
        );
      }

      const current = await this.get({
        tenantId,
        useCaseId: normalizedUseCaseId,
      });
      if (!current) {
        throw new UseCaseRegistryError(
          "use_case_not_found",
          "useCaseId is not registered for this tenant",
          404,
        );
      }
      if (current.status === targetStatus) {
        const history = await this.history({
          tenantId,
          useCaseId: normalizedUseCaseId,
        });
        return Object.freeze({
          changed: false,
          descriptor: current,
          event: history.at(-1),
        });
      }
      if (!TRANSITIONS[current.status]?.has(targetStatus)) {
        throw new UseCaseRegistryError(
          "invalid_status_transition",
          `use case status cannot transition from ${current.status} to ${targetStatus}`,
          409,
        );
      }

      const modelApprovalSnapshot = targetStatus === "approved"
        ? await approvedModelsSnapshot(tenantId, current.allowedModelIds)
        : Object.freeze([]);

      const transaction = await store.transaction((tx) => {
        const events = tenantEvents(tx, tenantId, normalizedUseCaseId);
        const latest = currentDescriptor(events);
        if (!latest) {
          throw new UseCaseRegistryError(
            "use_case_not_found",
            "useCaseId is not registered for this tenant",
            404,
          );
        }
        if (latest.status !== current.status) {
          throw new UseCaseRegistryError(
            "use_case_changed_concurrently",
            "use case status changed during transition validation",
            409,
          );
        }

        const descriptor = createUseCaseDescriptor({
          ...latest,
          status: targetStatus,
        });
        const previous = events.at(-1);
        const event = Object.freeze({
          contractType: "UseCaseRegistryEvent",
          contractVersion: "1.0",
          eventId: required(eventIdFactory(), "eventId"),
          tenantId,
          useCaseId: normalizedUseCaseId,
          revision: previous.revision + 1,
          eventType: "status_changed",
          previousEventId: previous.eventId,
          reasonCode: required(reasonCode, "reasonCode"),
          changedBy,
          changedAt: required(now(), "changedAt"),
          correlationId: required(correlationId, "correlationId"),
          descriptor,
          modelApprovalSnapshot,
          sensitiveContentIncluded: false,
        });

        tx.put(
          USE_CASE_REGISTRY_EVENT_COLLECTION,
          event.eventId,
          event,
          { ifAbsent: true },
        );
        integrity.appendInTransaction(tx, {
          tenantId,
          sourceCollection: USE_CASE_REGISTRY_EVENT_COLLECTION,
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

    async get({ tenantId, useCaseId } = {}) {
      const tenant = required(tenantId, "tenantId");
      const id = required(useCaseId, "useCaseId");
      const transaction = await store.transaction((tx) =>
        currentDescriptor(tenantEvents(tx, tenant, id))
      );
      return transaction.result;
    },

    async list({ tenantId, status, limit = 100 } = {}) {
      const tenant = required(tenantId, "tenantId");
      const normalizedLimit = Number(limit);
      if (
        !Number.isInteger(normalizedLimit)
        || normalizedLimit < 1
        || normalizedLimit > 500
      ) {
        throw new RangeError("limit must be an integer between 1 and 500");
      }
      if (status !== undefined && !USE_CASE_STATUSES.includes(String(status))) {
        throw new TypeError("status is invalid");
      }

      const transaction = await store.transaction((tx) => {
        const grouped = new Map();
        for (const event of tenantEvents(tx, tenant)) {
          grouped.set(event.useCaseId, event.descriptor);
        }
        return [...grouped.values()]
          .filter((descriptor) =>
            status === undefined || descriptor.status === status
          )
          .sort((left, right) =>
            left.useCaseId.localeCompare(right.useCaseId)
          )
          .slice(0, normalizedLimit);
      });
      return Object.freeze(transaction.result);
    },

    async history({ tenantId, useCaseId } = {}) {
      const tenant = required(tenantId, "tenantId");
      const id = required(useCaseId, "useCaseId");
      const transaction = await store.transaction((tx) =>
        tenantEvents(tx, tenant, id).map(publicEvent)
      );
      return Object.freeze(transaction.result);
    },
  });
}
