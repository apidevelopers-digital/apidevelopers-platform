import assert from "node:assert/strict";
import test from "node:test";

import {
  RadarSignalConflictError,
  RadarSignalValidationError,
  createInMemoryRadarEventIngestor,
  parseAndValidateRadarSignalEvent,
} from "../src/radar-signal-event.mjs";

function validEvent(overrides = {}) {
  return {
    schema: "radar.signal.v1",
    event_id: "evt_001",
    event_type: "lead.captured",
    occurred_at: "2026-08-26T18:00:00-03:00",
    received_at: "2026-08-26T18:00:01-03:00",
    organization_id: "org_api_developers",
    tenant_id: "tenant_api_developers",
    product_id: "product:radar",
    source: {
      channel: "web",
      surface: "api-developers-site",
      provider: "first-party",
    },
    subject: {
      kind: "anonymous",
      subject_id: "sub_001",
    },
    correlation_id: "corr_001",
    consent: {
      status: "unknown",
      purpose: "analytics",
    },
    context: {
      acquisition: {
        utm_source: "direct",
      },
    },
    payload: {},
    ...overrides,
  };
}

test("radar.signal.v1 validates a canonical event using trusted tenant context", () => {
  const event = parseAndValidateRadarSignalEvent(
    JSON.stringify(validEvent()),
    { tenantId: "tenant_api_developers" },
  );

  assert.equal(event.schema, "radar.signal.v1");
  assert.equal(event.product_id, "product:radar");
  assert.equal(event.tenant_id, "tenant_api_developers");
  assert.equal(event.source.channel, "web");
});

test("radar signal validation rejects cross-tenant injection", () => {
  assert.throws(
    () =>
      parseAndValidateRadarSignalEvent(
        validEvent({ tenant_id: "tenant_other" }),
        { tenantId: "tenant_api_developers" },
      ),
    (error) =>
      error instanceof RadarSignalValidationError &&
      error.code === "tenant_mismatch",
  );
});

test("radar signal validation rejects unknown event types", () => {
  assert.throws(
    () =>
      parseAndValidateRadarSignalEvent(
        validEvent({ event_type: "lead.magic" }),
        { tenantId: "tenant_api_developers" },
      ),
    (error) =>
      error instanceof RadarSignalValidationError &&
      error.field === "event_type",
  );
});

test("radar signal validation accepts anonymous subjects without inventing identity", () => {
  const event = parseAndValidateRadarSignalEvent(validEvent(), {
    tenantId: "tenant_api_developers",
  });

  assert.deepEqual(event.subject, {
    kind: "anonymous",
    subject_id: "sub_001",
  });
  assert.equal("name" in event.subject, false);
  assert.equal("phone" in event.subject, false);
});

test("in-memory shadow ingestor is idempotent for identical event_id", async () => {
  const ingestor = createInMemoryRadarEventIngestor();
  const event = parseAndValidateRadarSignalEvent(validEvent(), {
    tenantId: "tenant_api_developers",
  });

  const first = await ingestor.ingest(event);
  const duplicate = await ingestor.ingest(event);

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(await ingestor.count(), 1);
});

test("in-memory shadow ingestor rejects event_id reuse with changed payload", async () => {
  const ingestor = createInMemoryRadarEventIngestor();
  const first = parseAndValidateRadarSignalEvent(validEvent(), {
    tenantId: "tenant_api_developers",
  });
  const changed = parseAndValidateRadarSignalEvent(
    validEvent({ payload: { changed: true } }),
    { tenantId: "tenant_api_developers" },
  );

  await ingestor.ingest(first);

  await assert.rejects(
    () => ingestor.ingest(changed),
    (error) => error instanceof RadarSignalConflictError,
  );
});
