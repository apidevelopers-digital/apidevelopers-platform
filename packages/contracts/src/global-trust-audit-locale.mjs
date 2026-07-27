import {
  AUDIT_OUTCOMES,
  DIRECTIONS,
  EVIDENCE_KINDS,
  assertHeader,
  enumeration,
  finalize,
  header,
  id,
  iso,
  plainMetadata,
  string,
} from "./global-trust-support.mjs";

const BCP47 = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;
const SHA256 = /^[a-f0-9]{64}$/i;

export function assertAuditEventContract(value, name = "auditEvent") {
  assertHeader(value, "AuditEvent", name);
  id(value.eventId, `${name}.eventId`);
  id(value.tenantId, `${name}.tenantId`);
  id(value.actorId, `${name}.actorId`);
  string(value.action, `${name}.action`);
  string(value.resource, `${name}.resource`);
  enumeration(value.outcome, `${name}.outcome`, AUDIT_OUTCOMES);
  id(value.correlationId, `${name}.correlationId`);
  iso(value.occurredAt, `${name}.occurredAt`);
  plainMetadata(value.metadata, `${name}.metadata`);
  if (value.sensitiveContentIncluded !== false) throw new Error(`${name}.sensitiveContentIncluded must be false`);
  return value;
}

export function createAuditEvent({
  eventId,
  tenantId,
  actorId,
  action,
  resource,
  outcome,
  correlationId,
  metadata = {},
  occurredAt = new Date().toISOString(),
} = {}) {
  return finalize({
    ...header("AuditEvent"),
    eventId,
    tenantId,
    actorId,
    action,
    resource,
    outcome,
    correlationId,
    occurredAt,
    metadata: plainMetadata(metadata, "metadata"),
    sensitiveContentIncluded: false,
  }, assertAuditEventContract);
}

export function assertEvidenceRecordContract(value, name = "evidenceRecord") {
  assertHeader(value, "EvidenceRecord", name);
  id(value.evidenceId, `${name}.evidenceId`);
  id(value.tenantId, `${name}.tenantId`);
  enumeration(value.kind, `${name}.kind`, EVIDENCE_KINDS);
  string(value.source, `${name}.source`);
  if (value.hashAlgorithm !== "sha256") throw new Error(`${name}.hashAlgorithm must be sha256`);
  if (!SHA256.test(string(value.digest, `${name}.digest`))) throw new Error(`${name}.digest must be a SHA-256 hex digest`);
  iso(value.capturedAt, `${name}.capturedAt`);
  if (value.sensitiveContentIncluded !== false) throw new Error(`${name}.sensitiveContentIncluded must be false`);
  return value;
}

export function createEvidenceRecord({
  evidenceId,
  tenantId,
  kind,
  source,
  digest,
  capturedAt = new Date().toISOString(),
} = {}) {
  return finalize({
    ...header("EvidenceRecord"),
    evidenceId,
    tenantId,
    kind,
    source,
    hashAlgorithm: "sha256",
    digest,
    capturedAt,
    sensitiveContentIncluded: false,
  }, assertEvidenceRecordContract);
}

export function assertLocaleContextContract(value, name = "localeContext") {
  assertHeader(value, "LocaleContext", name);
  id(value.tenantId, `${name}.tenantId`);
  if (!BCP47.test(string(value.locale, `${name}.locale`))) throw new Error(`${name}.locale must be a BCP 47 tag`);
  if (!BCP47.test(string(value.fallbackLocale, `${name}.fallbackLocale`))) {
    throw new Error(`${name}.fallbackLocale must be a BCP 47 tag`);
  }
  enumeration(value.direction, `${name}.direction`, DIRECTIONS);
  string(value.timeZone, `${name}.timeZone`);
  if (!ISO_CURRENCY.test(string(value.currency, `${name}.currency`))) {
    throw new Error(`${name}.currency must be an ISO 4217 code`);
  }
  string(value.legalRegion, `${name}.legalRegion`);
  if (value.locale.toLowerCase().startsWith("ar") && value.direction !== "rtl") {
    throw new Error(`${name}.direction must be rtl for Arabic`);
  }
  return value;
}

export function createLocaleContext({
  tenantId,
  locale,
  fallbackLocale = "en",
  direction = String(locale ?? "").toLowerCase().startsWith("ar") ? "rtl" : "ltr",
  timeZone,
  currency,
  legalRegion,
} = {}) {
  return finalize({
    ...header("LocaleContext"),
    tenantId,
    locale,
    fallbackLocale,
    direction,
    timeZone,
    currency,
    legalRegion,
  }, assertLocaleContextContract);
}

