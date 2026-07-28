import { randomUUID } from "node:crypto";

import {
  createGlobalTrustIncidentQueueIntegrity,
} from "./global-trust-incident-queue-integrity.mjs";

export const INCIDENT_COLLECTION = "global_trust_incidents";
export const INCIDENT_EVENT_COLLECTION = "global_trust_incident_events";

export const INCIDENT_SEVERITIES = Object.freeze([
  "low",
  "moderate",
  "high",
  "critical",
]);

export const INCIDENT_CATEGORIES = Object.freeze([
  "prompt_injection",
  "data_exposure",
  "unsafe_output",
  "tool_misuse",
  "policy_violation",
  "integrity_failure",
  "other",
]);

export const INCIDENT_SOURCE_TYPES = Object.freeze([
  "prompt_defense",
  "output_validator",
  "tool_guard",
  "risk_engine",
  "integrity",
  "manual",
]);

export const INCIDENT_STATUSES = Object.freeze([
  "open",
  "triaged",
  "investigating",
  "contained",
  "resolved",
  "dismissed",
]);

const SEVERITY_SET = new Set(INCIDENT_SEVERITIES);
const CATEGORY_SET = new Set(INCIDENT_CATEGORIES);
const SOURCE_SET = new Set(INCIDENT_SOURCE_TYPES);
const STATUS_SET = new Set(INCIDENT_STATUSES);

const TRANSITIONS = Object.freeze({
  open: Object.freeze(["triaged", "dismissed"]),
  triaged: Object.freeze(["investigating", "contained", "dismissed"]),
  investigating: Object.freeze(["contained", "resolved", "dismissed"]),
  contained: Object.freeze(["investigating", "resolved"]),
  resolved: Object.freeze([]),
  dismissed: Object.freeze([]),
});

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function enumeration(value, name, allowed) {
  const normalized = required(value, name);
  if (!allowed.has(normalized)) {
    throw new TypeError(`${name} is invalid`);
  }
  return normalized;
}

function stringArray(value, name, maximum = 20) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError( ${name} must be an array`);
  if (value.length > maximum) throw new RangeError(`${name} must contain at most ${maximum} items`);

  const normalized = value.map((item, index) =>
    required(item, `${name}[${index}]`)
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${name} must not contain duplicates`);
  }
  return Object.freeze(normalized.sort());
}

function positiveInteger(value, name, maximum = 500) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > maximum) {
    throw new RangeError(`${name} must be an integer between 1 and ${maximum}`);
  }
  return normalized;
}

function tenantValues(tx, collection, tenantId) {
  return tx.list(collection)
    .map(({ value }) => value)
    .filter((value) => value?.tenantId === tenantId);
}

function eventsFor(tx, tenantId, incidentId) {
  return tenantValues(tx, INCIDENT_EVENT_COLLECTION, tenantId)
    .filter((event) => event.incidentId === incidentId)
    .sort((left, right) =>
      left.sequence - right.sequence
      || left.eventId.localeCompare(right.eventId)
    );
}

function publicState(incident, events) {
  const latest = events.at(-1);
  return Object.freeze({
    ...incident,
    status: latest?.toStatus ?? "open",
    updatedAt: latest?.createdAt ?? incident.createdAt,
    eventCount: events.length,
  });
}

export class IncidentQueueError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "IncidentQueueError";
    this.code = code;
    this.status = status;
  }
}

export function createGlobalTrustIncidentQueue({
  store,
  integrity = createGlobalTrustIncidentQueueIntegrity({ store }),
  incidentIdFactory = randomUUID,
  eventIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction is required");
  }
  if (typeof integrity?.appendInTransaction !== "function") {
    throw new TypeError("integrity.appendInTransaction is required");
  }

  function appendEvent(tx, {
    tenantId,
    incidentId,
    fromStatus,
    toStatus,
    action,
    actorId,
    actorKind,
    reasonCode,
    correlationId,
    sequence,
    createdAt,
  }) {
    const event = Object.freeze({
      contractType: "IncidentEvent",
      contractVersion: "1.0",
      eventId: required(eventIdFactory(), "eventId"),
      tenantId,
      incidentId,
      sequence,
      fromStatus,
      toStatus,
      action,
      actorId,
      actorKind,
      reasonCode,
      correlationId,
      createdAt,
      sensitiveContentIncluded: false,
      rawPayloadIncluded: false,
      automaticRemediationExecuted: false,
    });

    tx.put(INCIDENT_EVENT_COLLECTION, event.eventId, event, { ifAbsent: true });
    integrity.appendInTransaction(tx, {
      tenantId,
      sourceCollection: INCIDENT_EVENT_COLLECTION,
      recordId: event.eventId,
      payload: event,
    });
    return event;
  }

  return Object.freeze({
    async create({
      identity,
      category,
      severity,
      sourceType,
      correlationId,
      evidenceRefs,
    } = {}) {
      const principal = identity?.principal ?? {};
      const tenantId = required(
        principal.tenantId,
        "identity.principal.tenantId",
      );
      const reportedBy = required(principal.id, "identity.principal.id");
      const reporterKind = required(
        principal.kind ?? "unknown",
        "identity.principal.kind",
      );
      const createdAt = required(now(), "createdAt");
      const incidentId = required(incidentIdFactory(), "incidentId");

      const incident = Object.freeze({
        contractType: "IncidentRecord",
        contractVersion: "1.0",
        incidentId,
        tenantId,
        category: enumeration(category, "category", CATEGORY_SET),
        severity: enumeration(severity, "severity", SEVERITY_SET),
        sourceType: enumeration(sourceType, "sourceType", SOURCE_SET),
        correlationId: required(correlationId, "correlationId"),
        evidenceRefs: stringArray(evidenceRefs, "evidenceRefs"),
        reportedBy,
        reporterKind,
        createdAt,
        sensitiveContentIncluded: false,
        rawPayloadIncluded: false,
        automaticRemediationExecuted: false,
      });

      const transaction = await store.transaction((tx) => {
        tx.put(INCIDENT_COLLECTION, incident.incidentId, incident, {
          ifAbsent: true,
        });
        integrity.appendInTransaction(tx, {
          tenantId,
          sourceCollection: INCIDENT_COLLECTION,
          recordId: incident.incidentId,
          payload: incident,
        });

        const event = appendEvent(tx, {
          tenantId,
          incidentId,
          fromStatus: null,
          toStatus: "open",
          action: "created",
          actorId: reportedBy,
          actorKind: reporterKind,
          reasonCode: "incident_reported",
          correlationId: incident.correlationId,
          sequence: 1,
          createdAt,
        });

        return publicState(incident, [event]);
      });
      return transaction.result;
    },

    async listTenant({
      tenantId,
      status,
      severity,
      limit = 100,
    } = {}) {
      const tenant = required(tenantId, "tenantId");
      const normalizedLimit = positiveInteger(limit, "limit");
      const normalizedStatus = status === undefined
        ? null
        : enumeration(status, "status", STATUS_SET);
      const normalizedSeverity = severity === undefined
        ? null
        : enumeration(severity, "severity", SEVERITY_SET);

      const transaction = await store.transaction((tx) =>
        tenantValues(tx, INCIDENT_COLLECTION, tenant)
          .map((incident) =>
            publicState(incident, eventsFor(tx, tenant, incident.incidentId))
          )
          .filter((incident) =>
            (!normalizedStatus || incident.status === normalizedStatus)
            && (!normalizedSeverity || incident.severity === normalizedSeverity)
          )
          .sort((left, right) =>
            right.updatedAt.localeCompare(left.updatedAt)
            || left.incidentId.localeCompare(right.incidentId)
          )
          .slice(0, normalizedLimit)
      );
      return Object.freeze(transaction.result);
    },

    async get({ tenantId, incidentId } = {}) {
      const tenant = required(tenantId, "tenantId");
      const id = required(incidentId, "incidentId");
      const transaction = await store.transaction((tx) => {
        const incident = tx.get(INCIDENT_COLLECTION, id);
        if (!incident || incident.tenantId !== tenant) {
          throw new IncidentQueueError(
            "incident_not_found",
            "incident was not found",
            404,
          );
        }
        return publicState(incident, eventsFor(tx, tenant, id));
      });
      return transaction.result;
    },

    async history({ tenantId, incidentId } = {}) {
      const tenant = required(tenantId, "tenantId");
      const id = required(incidentId, "incidentId");
      const transaction = await store.transaction((tx) => {
        const incident = tx.get(INCIDENT_COLLECTION, id);
        if (!incident || incident.tenantId !== tenant) {
          throw new IncidentQueueError(
            "incident_not_found",
            "incident was not found",
            404,
          );
        }
        return Object.freeze(eventsFor(tx, tenant, id));
      });
      return transaction.result;
    },

    async transition({
      tenantId,
      incidentId,
      identity,
      status,
      reasonCode = "operator_transition",
    } = {}) {
      const tenant = required(tenantId, "tenantId");
      const id = required(incidentId, "incidentId");
      const principal = identity?.principal ?? {};
      const actorId = required(principal.id, "identity.principal.id");
      const actorKind = required(
        principal.kind ?? "unknown",
        "identity.principal.kind",
      );
      if (principal.tenantId !== tenant) {
        throw new IncidentQueueError(
          "tenant_mismatch",
          "operator tenant does not match incident tenant",
          403,
        );
      }
      if (actorKind !== "human") {
        throw new IncidentQueueError(
          "human_operator_required",
          "only a human principal may transition an incident",
          403,
        );
      }
      const target = enumeration(status, "status", STATUS_SET);
      const transitionedAt = required(now(), "transitionedAt");

      const transaction = await store.transaction((tx) => {
        const incident = tx.get(INCIDENT_COLLECTION, id);
        if (!incident || incident.tenantId !== tenant) {
          throw new IncidentQueueError(
            "incident_not_found",
            "incident was not found",
            404,
          );
        }

        const events = eventsFor(tx, tenant, id);
        const current = events.at(-1)?.toStatus ?? "open";
        if (!TRANSITIONS[current].includes(target)) {
          throw new IncidentQueueError(
            "invalid_status_transition",
            `incident cannot transition from ${current} to ${target}`,
            409,
          );
        }

        const event = appendEvent(tx, {
          tenantId: tenant,
          incidentId: id,
          fromStatus: current,
          toStatus: target,
          action: "status_transition",
          actorId,
          actorKind,
          reasonCode: required(reasonCode, "reasonCode"),
          correlationId: incident.correlationId,
          sequence: events.length + 1,
          createdAt: transitionedAt,
        });

        return publicState(incident, [...events, event]);
      });
      return transaction.result;
    },
  });
}
