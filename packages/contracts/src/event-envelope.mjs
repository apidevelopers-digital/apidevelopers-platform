import {
  assertCanonicalId,
  parseCanonicalId,
} from "./canonical-ids.mjs";

const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const CANONICAL_FIELDS = Object.freeze([
  "eventId",
  "eventType",
  "eventVersion",
  "tenantId",
  "requestId",
  "correlationId",
  "causationId",
  "occurredAt",
  "producer",
  "data",
]);

const LEGACY_FIELDS = Object.freeze([
  "event_id",
  "event_type",
  "event_version",
  "tenant_id",
  "request_id",
  "correlation_id",
  "causation_id",
  "occurred_at",
  "producer",
  "data",
]);

export const eventEnvelopeContractId = "contract.event-envelope.v1";
export const eventEnvelopeContractVersion = "1.0.0";

export const institutionalEventContracts = deepFreeze({
  MemoryRecorded: {
    eventType: "event.memory-recorded",
    contractId: "contract.event.memory-recorded.v1",
    eventVersion: "1.0.0",
  },
  DecisionCreated: {
    eventType: "event.decision-created",
    contractId: "contract.event.decision-created.v1",
    eventVersion: "1.0.0",
  },
  PlanGenerated: {
    eventType: "event.plan-generated",
    contractId: "contract.event.plan-generated.v1",
    eventVersion: "1.0.0",
  },
  ExecutionRequested: {
    eventType: "event.execution-requested",
    contractId: "contract.event.execution-requested.v1",
    eventVersion: "1.0.0",
  },
  ExecutionBlocked: {
    eventType: "event.execution-blocked",
    contractId: "contract.event.execution-blocked.v1",
    eventVersion: "1.0.0",
  },
});

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  if (value !== value.trim()) {
    throw new TypeError(`${name} must not contain surrounding whitespace`);
  }
}

function assertExactFields(value, expected, name) {
  const expectedSet = new Set(expected);
  const unknown = Object.keys(value).filter((key) => !expectedSet.has(key)).sort();
  if (unknown.length) {
    throw new TypeError(`${name} contains unknown field(s): ${unknown.join(", ")}`);
  }
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  if (missing.length) {
    throw new TypeError($${name} is missing field(s): ${missing.join(", ")}$);
  }
}

function assertSemver(value, name) {
  assertString(value, name);
  if (!SEMVER.test(value)) {
    throw new TypeError(`${name} must be a semantic version`);
  }
}

function assertIsoInstant(value, name) {
  assertString(value, name);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new TypeError($${name} must be a normalized UTC ISO-8601 instant$);
  }
}

function assertProducer(value) {
  const parsed = parseCanonicalId(value);
  if (!["component", "capability"].includes(parsed.family)) {
    throw new TypeError("producer must be a canonical component or capability id");
  }
}

function assertCausationId(value) {
  if (value === null) return;
  assertCanonicalId(value, { expectedFamily: "event" });
}

export function validateEventEnvelope(value) {
  assertObject(value, "eventEnvelope");
  assertExactFields(value, CANONICAL_FIELDS, "eventEnvelope");

  assertCanonicalId(value.eventId, { expectedFamily: "event" });
  assertCanonicalId(value.eventType, { expectedFamily: "event" });
  assertSemver(value.eventVersion, "eventEnvelope.eventVersion");
  assertString(value.tenantId, "eventEnvelope.tenantId");
  assertString(value.requestId, "eventEnvelope.requestId");
  assertString(value.correlationId, "eventEnvelope.correlationId");
  assertCausationId(value.causationId);
  assertIsoInstant(value.occurredAt, "eventEnvelope.occurredAt");
  assertProducer(value.producer);
  assertObject(value.data, "eventEnvelope.data");

  return deepFreeze({
    eventId: value.eventId,
    eventType: value.eventType,
    eventVersion: value.eventVersion,
    tenantId: value.tenantId,
    requestId: value.requestId,
    correlationId: value.correlationId,
    causationId: value.causationId,
    occurredAt: value.occurredAt,
    producer: value.producer,
    data: clone(value.data),
  });
}

export function createEventEnvelope(value) {
  return validateEventEnvelope(value);
}

export function isEventEnvelope(value) {
  try {
    validateEventEnvelope(value);
    return true;
  } catch {
    return false;
  }
}

export function adaptLegacyEventEnvelope(value) {
  assertObject(value, "legacyEventEnvelope");
  assertExactFields(value, LEGACY_FIELDS- "legacyEventEnvelope");

  return validateEventEnvelope({
    eventId: value.event_id,
    eventType: value.event_type,
    eventVersion: value.event_version,
    tenantId: value.tenant_id,
    requestId: value.request_id,
    correlationId: value.correlation_id,
    causationId: value.causation_id,
    occurredAt: value.occurred_at,
    producer: value.producer,
    data: value.data,
  });
}

export function toLegacyEventEnvelope(value) {
  const envelope = validateEventEnvelope(value);
  return deepFreeze({
    event_id: envelope.eventId,
    event_type: envelope.eventType,
    event_version: envelope.eventVersion,
    tenant_id: envelope.tenantId,
    request_id: envelope.requestId,
    correlation_id: envelope.correlationId,
    causation_id: envelope.causationId,
    occurred_at: envelope.occurredAt,
    producer: envelope.producer,
    data: clone(envelope.data),
  });
}

assertCanonicalId(eventEnvelopeContractId, { expectedFamily: "contract" });
for (const definition of Object.values(institutionalEventContracts)) {
  assertCanonicalId(definition.eventType, { expectedFamily: "event" });
  assertCanonicalId(definition.contractId, { expectedFamily: "contract" });
  assertSemver(definition.eventVersion, "institutional event version");
}
