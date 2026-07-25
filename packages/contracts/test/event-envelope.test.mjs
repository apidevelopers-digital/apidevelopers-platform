import test from "node:test";
import assert from "node:assert/strict";

import {
  adaptLegacyEventEnvelope,
  createEventEnvelope,
  eventEnvelopeContractId,
  eventEnvelopeContractVersion,
  institutionalEventContracts,
  isEventEnvelope,
  toLegacyEventEnvelope,
  validateEventEnvelope,
} from "../src/event-envelope.mjs";

function canonical(overrides = {}) {
  return {
    eventId: "event.20260717.0001",
    eventType: "event.memory-recorded",
    eventVersion: "1.0.0",
    tenantId: "tenant-001",
    requestId: "request-001",
    correlationId: "correlation-001",
    causationId: null,
    occurredAt: "2026-07-17T09:00:00.000Z",
    producer: "component.platform.memory",
    data: {
      memoryId: "memory.001",
      facts: ["a", "b"],
    },
    ...overrides,
  };
}

function legacy(overrides = {}) {
  return {
    event_id: "event.20260717.0001",
    event_type: "event.memory-recorded",
    event_version: "1.0.0",
    tenant_id: "tenant-001",
    request_id: "request-001",
    correlation_id: "correlation-001",
    causation_id: null,
    occurred_at: "2026-07-17T09:00:00.000Z",
    producer: "component.platform.memory",
    data: {
      memoryId: "memory.001",
    },
    ...overrides,
  };
}

test("exports a versioned envelope contract and five institutional event contracts", () => {
  assert.equal(eventEnvelopeContractId, "contract.event-envelope.v1");
  assert.equal(eventEnvelopeContractVersion, "1.0.0");
  assert.deepEqual(Object.keys(institutionalEventContracts), [
    "MemoryRecorded",
    "DecisionCreated",
    "PlanGenerated",
    "ExecutionRequested",
    "ExecutionBlocked",
  ]);
  assert.equal(institutionalEventContracts.ExecutionBlocked.eventType, "event.execution-blocked");
  assert.equal(Object.isFrozen(institutionalEventContracts), true);
  assert.equal(Object.isFrozen(institutionalEventContracts.MemoryRecorded), true);
});

test("creates an immutable canonical event envelope", () => {
  const envelope = createEventEnvelope(canonical());
  assert.equal(envelope.eventType, "event.memory-recorded");
  assert.equal(envelope.producer, "component.platform.memory");
  assert.equal(Object.isFrozen(envelope), true);
  assert.equal(Object.isFrozen(envelope.data), true);
  assert.equal(Object.isFrozen(envelope.data.facts), true);
});

test("clones data and does not mutate the source envelope", () => {
  const source = canonical();
  const before = structuredClone(source);
  const envelope = createEventEnvelope(source);
  source.data.facts.push("c");
  assert.deepEqual(envelope.data.facts, ["a", "b"]);
  assert.notEqual(envelope.data, source.data);
  assert.deepEqual({ ...source, data: before.data }, before);
});

test("requires the exact canonical field set", () => {
  const missing = canonical();
  delete missing.requestId;
  assert.throws(() => validateEventEnvelope(missing), /missing field\(s\): requestId/);
  assert.throws(
    () => validateEventEnvelope({ ...canonical(), metadata: {} }),
    /unknown field\(s\): metadata/,
  );
});

test("requires eventId and eventType to use the event family", () => {
  assert.throws(
    () => validateEventEnvelope(canonical({ eventId: "decision.20260717.0001" })),
    (error) => error.code === "ID_FAMILY_MISMATCH",
  );
  assert.throws(
    () => validateEventEnvelope(canonical({ eventType: "capability.memory-recorded" })),
    (error) => error.code === "ID_FAMILY_MISMATCH",
  );
});

test("requires semantic event versions", () => {
  for (const eventVersion of ["1", "v1", "01.0.0", "1.0", "latest"]) {
    assert.throws(
      () => validateEventEnvelope(canonical({ eventVersion })),
      /eventEnvelope\.eventVersion must be a semantic version/,
    );
  }
  assert.equal(validateEventEnvelope(canonical({ eventVersion: "2.1.0-beta.1" })).eventVersion, "2.1.0-beta.1");
});

test("requires tenant, request and correlation identifiers as explicit strings", () => {
  assert.throws(() => validateEventEnvelope(canonical({ tenantId: "" })), /tenantId must be a non-empty string/);
  assert.throws(() => validateEventEnvelope(canonical({ requestId: " request " })), /surrounding whitespace/);
  assert.throws(() => validateEventEnvelope(canonical({ correlationId: null })), /correlationId must be a non-empty string/);
});

test("accepts null causation for root events", () => {
  const envelope = validateEventEnvelope(canonical({ causationId: null }));
  assert.equal(envelope.causationId, null);
});

test("requires non-null causation to reference an event id", () => {
  assert.equal(
    validateEventEnvelope(canonical({ causationId: "event.20260717.0000" })).causationId,
    "event.20260717.0000",
  );
  assert.throws(
    () => validateEventEnvelope(canonical({ causationId: "decision.20260717.0000" })),
    (error) => error.code === "ID_FAMILY_MISMATCH",
  );
});

test("requires normalized UTC ISO-8601 instants", () => {
  for (const occurredAt of [
    "2026-07-17",
    "2026-07-17T09:00:00Z",
    "2026-07-17T06:00:00.000-03:00",
    "not-a-date",
  ]) {
    assert.throws(
      () => validateEventEnvelope(canonical({ occurredAt })),
      /normalized UTC ISO-8601 instant/,
    );
  }
});

test("accepts canonical component and capability producers", () => {
  assert.equal(
    validateEventEnvelope(canonical({ producer: "component.platform.memory" })).producer,
    "component.platform.memory",
  );
  assert.equal(
    validateEventEnvelope(canonical({ producer: "capability.memory" })).producer,
    "capability.memory",
  );
});

test("rejects producers outside component and capability families", () => {
  assert.throws(
    () => validateEventEnvelope(canonical({ producer: "event.memory-recorded" })),
    /producer must be a canonical component or capability id/,
  );
});

test("requires data to be an object", () => {
  for (const data of [null, [], "value", 1]) {
    assert.throws(() => validateEventEnvelope(canonical({ data })), /eventEnvelope\.data must be an object/);
  }
});

test("isEventEnvelope reports validity without throwing", () => {
  assert.equal(isEventEnvelope(canonical()), true);
  assert.equal(isEventEnvelope(canonical({ eventVersion: "latest" })), false);
  assert.equal(isEventEnvelope(null), false);
});

test("adapts the historical snake_case envelope explicitly", () => {
  const envelope = adaptLegacyEventEnvelope(legacy());
  assert.deepEqual(envelope, {
    eventId: "event.20260717.0001",
    eventType: "event.memory-recorded",
    eventVersion: "1.0.0",
    tenantId: "tenant-001",
    requestId: "request-001",
    correlationId: "correlation-001",
    causationId: null,
    occurredAt: "2026-07-17T09:00:00.000Z",
    producer: "component.platform.memory",
    data: { memoryId: "memory.001" },
  });
});

test("legacy adapter rejects mixed or incomplete field shapes", () => {
  assert.throws(
    () => adaptLegacyEventEnvelope({ ...legacy(), eventId: "event.duplicate" }),
    /unknown field\(s\): eventId/,
  );
  const missing = legacy();
  delete missing.event_id;
  assert.throws(() => adaptLegacyEventEnvelope(missing), /missing field\(s\): event_id/);
});

test("exports canonical envelopes back to the historical field shape", () => {
  const output = toLegacyEventEnvelope(canonical());
  assert.equal(output.event_id, "event.20260717.0001");
  assert.equal(output.event_type, "event.memory-recorded");
  assert.equal(output.event_version, "1.0.0");
  assert.equal(output.tenant_id, "tenant-001");
  assert.equal(output.occurred_at, "2026-07-17T09:00:00.000Z");
  assert.equal(Object.isFrozen(output), true);
  assert.equal(Object.isFrozen(output.data), true);
});

test("round-trips the legacy envelope without silent aliases", () => {
  const source = legacy({ causation_id: "event.20260717.0000" });
  const roundTrip = toLegacyEventEnvelope(adaptLegacyEventEnvelope(source));
  assert.deepEqual(roundTrip, source);
});

test("does not expose publication or execution methods", () => {
  const envelope = createEventEnvelope(canonical());
  assert.equal("publish" in envelope, false);
  assert.equal("execute" in envelope, false);
  assert.equal("approve" in envelope, false);
  assert.equal("mutate" in envelope, false);
});

test("rejects legacy values that are not canonical after field adaptation", () => {
  assert.throws(
    () => adaptLegacyEventEnvelope(legacy({ event_type: "MemoryRecorded" })),
    (error) => error.code === "ID_CASE",
  );
  assert.throws(
    () => adaptLegacyEventEnvelope(legacy({ producer: "ap.events" })),
    (error) => error.code === "ID_UNKNOWN_FAMILY",
  );
});
