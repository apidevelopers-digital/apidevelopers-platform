
import { assertCanonicalId, parseCanonicalId } from "./canonical-ids.mjs";

const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const STATUSES = Object.freeze(["started", "success", "error", "blocked"]);
const FIELDS = Object.freeze([
  "traceId", "spanId", "parentSpanId", "componentId", "componentVersion",
  "operation", "status", "startedAt", "endedAt", "durationMs",
  "tenantId", "decisionId", "requestId", "correlationId", "attributes",
]);
const LEGACY_FIELDS = Object.freeze([
  "trace_id", "span_id", "parent_span_id", "component_id", "component_version",
  "operation", "status", "started_at", "ended_at", "duration_ms",
  "tenant_id", "decision_id", "request_id", "correlation_id", "attributes",
]);

export const observabilityEnvelopeContractId = "contract.observability-envelope.v1";
export const observabilityEnvelopeContractVersion = "1.0.0";
export const observabilityStatuses = STATUSES;

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
  if (value !== value.trim()) throw new TypeError(`${name} must not contain surrounding whitespace`);
}

function assertNullableString(value, name) {
  if (value === null) return;
  assertString(value, name);
}

function assertExactFields(value, fields, name) {
  const expected = new Set(fields);
  const unknown = Object.keys(value).filter((key) => !expected.has(key)).sort();
  if (unknown.length) throw new TypeError(`${name} contains unknown field(s): ${unknown.join(", ")}`);
  const missing = fields.filter((key) => !Object.hasOwn(value, key));
  if (missing.length) throw new TypeError(`${name} is missing field(s): ${missing.join(", ")}`);
}

function assertInstant(value, name, nullable = false) {
  if (nullable && value === null) return;
  assertString(value, name);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new TypeError(`${name} must be a normalized UTC ISO-8601 instant`);
  }
}

function assertComponent(value) {
  const parsed = parseCanonicalId(value);
  if (!["component", "capability"].includes(parsed.family)) {
    throw new TypeError(componentId must be a canonical component or capability id);
  }
}

function assertDuration(value) {
  if (value === null) return;
  if (!Number.isFinite(value) || value < 0) throw new TypeError("durationMs must be a non-negative finite number or null");
}

function assertTiming(value) {
  const started = new Date(value.startedAt).getTime();
  if (value.status === "started") {
    if (value.endedAt !== null || value.durationMs !== null) {
      throw new TypeError("started observations must not define endedAt or durationMs");
    }
    return;
  }
  if (value.endedAt === null || value.durationMs === null) {
    throw new TypeError("terminal observations require endedAt and durationMs");
  }
  const ended = new Date(value.endedAt).getTime();
  if (ended < started) throw new TypeError("endedAt must not precede startedAt");
  if (value.durationMs !== ended - started) {
    throw new TypeError("durationMs must equal endedAt - startedAt");
  }
}

export function validateObservabilityEnvelope(value) {
  assertObject(value, "observabilityEnvelope");
  assertExactFields(value, FIELDS, "observabilityEnvelope");
  assertCanonicalId(value.traceId, { expectedFamily: "trace" });
  assertString(value.spanId, "observabilityEnvelope.spanId");
  assertNullableString(value.parentSpanId, "observabilityEnvelope.parentSpanId");
  if (value.parentSpanId === value.spanId) throw new TypeError("parentSpanId must differ from spanId");
  assertComponent(value.componentId);
  assertString(value.componentVersion, "observabilityEnvelope.componentVersion");
  if (!SEMVER.test(value.componentVersion)) throw new TypeError("componentVersion must be a semantic version");
  assertString(value.operation, "observabilityEnvelope.operation");
  if (!STATUSES.includes(value.status)) throw new TypeError(`status must be one of: ${STATUSES.join(", ")}`);
  assertInstant(value.startedAt, "observabilityEnvelope.startedAt");
  assertInstant(value.endedAt, "observabilityEnvelope.endedAt", true);
  assertDuration(value.durationMs);
  assertNullableString(value.tenantId, "observabilityEnvelope.tenantId");
  if (value.decisionId !== null) assertCanonicalId(value.decisionId, { expectedFamily: "decision" });
  assertNullableString(value.requestId, "observabilityEnvelope.requestId");
  assertNullableString(value.correlationId, "observabilityEnvelope.correlationId");
  assertObject(value.attributes, "observabilityEnvelope.attributes");
  assertTiming(value);
  return deepFreeze({ ...value, attributes: clone(value.attributes) });
}

export function createObservabilityEnvelope(value) {
  return validateObservabilityEnvelope(value);
}

export function isObservabilityEnvelope(value) {
  try {
    validateObservabilityEnvelope(value);
    return true;
  } catch {
    return false;
  }
}

export function adaptLegacyObservabilityEnvelope(value) {
  assertObject(value, "legacyObservabilityEnvelope");
  assertExactFields(value, LEGACY_FIELDS, "legacyObservabilityEnvelope");
  return validateObservabilityEnvelope({
    traceId: value.trace_id,
    spanId: value.span_id,
    parentSpanId: value.parent_span_id,
    componentId: value.component_id,
    componentVersion: value.component_version,
    operation: value.operation,
    status: value.status,
    startedAt: value.started_at,
    endedAt: value.ended_at,
    durationMs: value.duration_ms,
    tenantId: value.tenant_id,
    decisionId: value.decision_id,
    requestId: value.request_id,
    correlationId: value.correlation_id,
    attributes: value.attributes,
  });
}

export function toLegacyObservabilityEnvelope(value) {
  const envelope = validateObservabilityEnvelope(value);
  return deepFreeze({
    trace_id: envelope.traceId,
    span_id: envelope.spanId,
    parent_span_id: envelope.parentSpanId,
    component_id: envelope.componentId,
    component_version: envelope.componentVersion,
    operation: envelope.operation,
    status: envelope.status,
    started_at: envelope.startedAt,
    ended_at: envelope.endedAt,
    duration_ms: envelope.durationMs,
    tenant_id: envelope.tenantId,
    decision_id: envelope.decisionId,
    request_id: envelope.requestId,
    correlation_id: envelope.correlationId,
    attributes: clone(envelope.attributes),
  });
}

assertCanonicalId(observabilityEnvelopeContractId, { expectedFamily: "contract" });
