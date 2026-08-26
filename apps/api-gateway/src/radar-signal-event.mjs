
const ALLOWED_EVENT_TYPES = new Set([
  "visitor.session.started",
  "visitor.page.viewed",
  "visitor.cta.clicked",
  "lead.captured",
  "lead.identified",
  "lead.enriched",
  "lead.qualified",
  "opportunity.created",
  "opportunity.routed",
  "handoff.requested",
  "handoff.accepted",
  "conversation.started",
  "conversation.message.received",
  "conversation.continued",
  "campaign.attributed",
  "proposal.generated",
  "sale.closed",
  "delivery.started",
  "consent.updated",
]);

const ALLOWED_CHANNELS = new Set([
  "web",
  "whatsapp",
  "instagram",
  "facebook",
  "other",
]);

const ALLOWED_SUBJECT_KINDS = new Set([
  "anonymous",
  "lead",
  "customer",
]);

const ALLOWED_CONSENT_STATUS = new Set([
  "unknown",
  "granted",
  "denied",
  "revoked",
]);

const ALLOWED_CONSENT_PURPOSE = new Set([
  "analytics",
  "commercial",
  "support",
  "handoff",
]);

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value),
  );
}

function requireObject(value, field) {
  if (!isPlainObject(value)) {
    throw new RadarSignalValidationError("invalid_field", field);
  }
  return value;
}

function requireString(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new RadarSignalValidationError("invalid_field", field);
  }
  return normalized;
}

function requireEnum(value, field, allowed) {
  const normalized = requireString(value, field);
  if (!allowed.has(normalized)) {
    throw new RadarSignalValidationError("invalid_field", field);
  }
  return normalized;
}

function requireDateTime(value, field) {
  const normalized = requireString(value, field);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new RadarSignalValidationError("invalid_field", field);
  }
  return normalized;
}

function parseObjectBody(body) {
  if (isPlainObject(body)) return body;

  if (typeof body !== "string" || body.trim() === "") {
    throw new RadarSignalValidationError("invalid_json", "body");
  }

  try {
    const parsed = JSON.parse(body);
    if (!isPlainObject(parsed)) {
      throw new RadarSignalValidationError("invalid_json", "body");
    }
    return parsed;
  } catch (error) {
    if (error instanceof RadarSignalValidationError) throw error;
    throw new RadarSignalValidationError("invalid_json", "body");
  }
}

function canonicalEventFingerprint(event) {
  return JSON.stringify(event);
}

export class RadarSignalValidationError extends Error {
  constructor(code, field) {
    super(code);
    this.name = "RadarSignalValidationError";
    this.code = code;
    this.field = field;
  }
}

export class RadarSignalConflictError extends Error {
  constructor(code = "event_id_conflict") {
    super(code);
    this.name = "RadarSignalConflictError";
    this.code = code;
  }
}

export function parseAndValidateRadarSignalEvent(body, { tenantId } = {}) {
  const trustedTenantId = requireString(tenantId, "tenant_id");
  const input = parseObjectBody(body);

  const schema = requireString(input.schema, "schema");
  if (schema !== "radar.signal.v1") {
    throw new RadarSignalValidationError("unsupported_schema", "schema");
  }

  const productId = requireString(input.product_id, "product_id");
  if (productId !== "product:radar") {
    throw new RadarSignalValidationError("invalid_product", "product_id");
  }

  const providedTenantId = requireString(input.tenant_id, "tenant_id");
  if (providedTenantId !== trustedTenantId) {
    throw new RadarSignalValidationError("tenant_mismatch", "tenant_id");
  }

  const source = requireObject(input.source, "source");
  const subject = requireObject(input.subject, "subject");
  const consent = requireObject(input.consent, "consent");
  const context = requireObject(input.context ?? {}, "context");
  const payload = requireObject(input.payload ?? {}, "payload");

  return Object.freeze({
    schema,
    event_id: requireString(input.event_id, "event_id"),
    event_type: requireEnum(
      input.event_type,
      "event_type",
      ALLOWED_EVENT_TYPES,
    ),
    occurred_at: requireDateTime(input.occurred_at, "occurred_at"),
    received_at: requireDateTime(input.received_at, "received_at"),
    organization_id: requireString(
      input.organization_id,
      "organization_id",
    ),
    tenant_id: trustedTenantId,
    product_id: productId,
    source: Object.freeze({
      channel: requireEnum(
        source.channel,
        "source.channel",
        ALLOWED_CHANNELS,
      ),
      surface: requireString(source.surface, "source.surface"),
      provider: requireString(source.provider, "source.provider"),
    }),
    subject: Object.freeze({
      kind: requireEnum(
        subject.kind,
        "subject.kind",
        ALLOWED_SUBJECT_KINDS,
      ),
      subject_id: requireString(
        subject.subject_id,
        "subject.subject_id",
      ),
    }),
    correlation_id: requireString(
      input.correlation_id,
      "correlation_id",
    ),
    consent: Object.freeze({
      status: requireEnum(
        consent.status,
        "consent.status",
        ALLOWED_CONSENT_STATUS,
      ),
      purpose: requireEnum(
        consent.purpose,
        "consent.purpose",
        ALLOWED_CONSENT_PURPOSE,
      ),
      ...(consent.evidence_id !== undefined
        ? {
            evidence_id: requireString(
              consent.evidence_id,
              "consent.evidence_id",
            ),
          }
        : {}),
    }),
    context: structuredClone(context),
    payload: structuredClone(payload),
  });
}

export function createInMemoryRadarEventIngestor() {
  const events = new Map();

  return Object.freeze({
    async ingest(event) {
      const existing = events.get(event.event_id);
      const fingerprint = canonicalEventFingerprint(event);

      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new RadarSignalConflictError();
        }

        return Object.freeze({
          accepted: true,
          duplicate: true,
          eventId: event.event_id,
          correlationId: event.correlation_id,
          schema: event.schema,
        });
      }

      events.set(event.event_id, {
        fingerprint,
        event: structuredClone(event),
      });

      return Object.freeze({
        accepted: true,
        duplicate: false,
        eventId: event.event_id,
        correlationId: event.correlation_id,
        schema: event.schema,
      });
    },

    async get(eventId) {
      const record = events.get(String(eventId));
      return record ? structuredClone(record.event) : null;
    },

    async count() {
      return events.size;
    },
  });
}
