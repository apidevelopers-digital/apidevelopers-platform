import { randomUUID } from "node:crypto";

import {
  DATA_POLICY_STATUSES,
  createDataPolicyDescriptor,
} from "@apidevelopers/contracts";

import {
  DATA_POLICY_REGISTRY_EVENT_COLLECTION,
  createGlobalTrustDataPolicyRegistryIntegrity,
} from "./global-trust-data-policy-registry-integrity.mjs";

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

function tenantEvents(tx, tenantId, dataPolicyId) {
  return tx.list(DATA_POLICY_REGISTRY_EVENT_COLLECTION)
    .map(({ value }) => value)
    .filter((event) =>
      event?.tenantId === tenantId
      && (
        dataPolicyId === undefined
        || event.dataPolicyId === dataPolicyId
      )
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
    throw new DataPolicyRegistryError(
      "human_operator_required",
      "only a human principal may change the data policy registry",
      403,
    );
  }
  if (
    required(principal.tenantId, "identity.principal.tenantId") !== tenantId
  ) {
    throw new DataPolicyRegistryError(
      "tenant_mismatch",
      "operator tenant must match the data policy registry tenant",
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
    dataPolicyId: event.dataPolicyId,
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

export class DataPolicyRegistryError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "DataPolicyRegistryError";
    this.code = code;
    this.status = status;
  }
}

export function createGlobalTrustDataPolicyRegistry({
  store,
  integrity = createGlobalTrustDataPolicyRegistryIntegrity({ store }),
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
      dataPolicyId,
      ownerId,
      purpose,
      allowedDataClasses,
      allowedRegions,
      retentionDays,
      promptPersistenceAllowed = false,
      responsePersistenceAllowed = false,
      providerTrainingAllowed = false,
      crossTenantSharingAllowed = false,
      redactionRequired = true,
      humanReviewRequiredForSensitiveData = true,
      reasonCode = "initial_registration",
      correlationId,
    } = {}) {
      const tenantId = required(
        identity?.principal?.tenantId,
        "identity.principal.tenantId",
      );
      const changedBy = assertHumanOperator(identity, tenantId);
      const normalizedPolicyId = required(dataPolicyId, "dataPolicyId");
      const descriptor = createDataPolicyDescriptor({
        dataPolicyId: normalizedPolicyId,
        tenantId,
        ownerId: required(ownerId, "ownerId"),
        purpose: required(purpose, "purpose"),
        status: "draft",
        allowedDataClasses,
        allowedRegions,
        retentionDays,
        promptPersistenceAllowed: Boolean(promptPersistenceAllowed),
        responsePersistenceAllowed: Boolean(responsePersistenceAllowed),
        providerTrainingAllowed: Boolean(providerTrainingAllowed),
        crossTenantSharingAllowed: Boolean(crossTenantSharingAllowed),
        redactionRequired: Boolean(redactionRequired),
        humanReviewRequiredForSensitiveData: Boolean(
          humanReviewRequiredForSensitiveData,
        ),
      });

      const event = Object.freeze({
        contractType: "DataPolicyRegistryEvent",
        contractVersion: "1.0",
        eventId: required(eventIdFactory(), "eventId"),
        tenantId,
        dataPolicyId: normalizedPolicyId,
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
        if (tenantEvents(tx, tenantId, normalizedPolicyId).length) {
          throw new DataPolicyRegistryError(
            "data_policy_already_registered",
            "dataPolicyId is already registered for this tenant",
            409,
          );
        }
        tx.put(
          DATA_POLICY_REGISTRY_EVENT_COLLECTION,
          event.eventId,
          event,
          { ifAbsent: true },
        );
        integrity.appendInTransaction(tx, {
          tenantId,
          sourceCollection: DATA_POLICY_REGISTRY_EVENT_COLLECTION,
          recordId: event.eventId,
          payload: event,
        });
        return publicEvent(event);
      });

      return transaction.result;
    },

    async transition({
      identity,
      dataPolicyId,
      status,
      reasonCode,
      correlationId,
    } = {}) {
      const tenantId = required(
        identity?.principal?.tenantId,
        "identity.principal.tenantId",
      );
      const changedBy = assertHumanOperator(identity, tenantId);
      const normalizedPolicyId = required(dataPolicyId, "dataPolicyId");
      const targetStatus = required(status, "status");
      if (!DATA_POLICY_STATUSES.includes(targetStatus)) {
        throw new DataPolicyRegistryError(
          "invalid_data_policy_status",
          "status must be draft, approved, suspended, or retired",
          400,
        );
      }

      const current = await this.get({
        tenantId,
        dataPolicyId: normalizedPolicyId,
      });
      if (!current) {
        throw new DataPolicyRegistryError(
          "data_policy_not_found",
          "dataPolicyId is not registered for this tenant",
          404,
        );
      }
      if (current.status === targetStatus) {
        const history = await this.history({
          tenantId,
          dataPolicyId: normalizedPolicyId,
        });
        return Object.freeze({
          changed: false,
          descriptor: current,
          event: history.at(-1),
        });
      }
      if (!TRANSITIONS[current.status]?.has(targetStatus)) {
        throw new DataPolicyRegistryError(
          "invalid_status_transition",
          `data policy status cannot transition from ${current.status} to ${targetStatus}`,
          409,
        );
      }

      const transaction = await store.transaction((tx) => {
        const events = tenantEvents(tx, tenantId, normalizedPolicyId);
        const latest = currentDescriptor(events);
        if (!latest) {
          throw new DataPolicyRegistryError(
            "data_policy_not_found",
            "dataPolicyId is not registered for this tenant",
            404,
          );
        }
        if (latest.status !== current.status) {
          throw new DataPolicyRegistryError(
            "data_policy_changed_concurrently",
            "data policy status changed during transition validation",
            409,
          );
        }

        const descriptor = createDataPolicyDescriptor({
          ...latest,
          status: targetStatus,
        });
        const previous = events.at(-1);
        const event = Object.freeze({
          contractType: "DataPolicyRegistryEvent",
          contractVersion: "1.0",
          eventId: required(eventIdFactory(), "eventId"),
          tenantId,
          dataPolicyId: normalizedPolicyId,
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
          DATA_POLICY_REGISTRY_EVENT_COLLECTION,
          event.eventId,
          event,
          { ifAbsent: true },
        );
        integrity.appendInTransaction(tx, {
          tenantId,
          sourceCollection: DATA_POLICY_REGISTRY_EVENT_COLLECTION,
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

    async get({ tenantId, dataPolicyId } = {}) {
      const tenant = required(tenantId, "tenantId");
      const id = required(dataPolicyId, "dataPolicyId");
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
      if (
        status !== undefined
        && !DATA_POLICY_STATUSES.includes(String(status))
      ) {
        throw new TypeError("status is invalid");
      }

      const transaction = await store.transaction((tx) => {
        const grouped = new Map();
        for (const event of tenantEvents(tx, tenant)) {
          grouped.set(event.dataPolicyId, event.descriptor);
        }
        return [...grouped.values()]
          .filter((descriptor) =>
            status === undefined || descriptor.status === status
          )
          .sort((left, right) =>
            left.dataPolicyId.localeCompare(right.dataPolicyId)
          )
          .slice(0, normalizedLimit);
      });
      return Object.freeze(transaction.result);
    },

    async history({ tenantId, dataPolicyId } = {}) {
      const tenant = required(tenantId, "tenantId");
      const id = required(dataPolicyId, "dataPolicyId");
      const transaction = await store.transaction((tx) =>
        tenantEvents(tx, tenant, id).map(publicEvent)
      );
      return Object.freeze(transaction.result);
    },
  });
}
