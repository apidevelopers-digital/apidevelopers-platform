import { createHash } from "node:crypto";

export const TRUST_EVALUATION_PORTAL_INBOX_VERSION =
  "trust-evaluation-portal-inbox/v1";
const COLLECTION = "trust.evaluation.portal_inbox";
const ENVELOPE_KEYS = new Set([
  "version",
  "algorithm",
  "recipientKeyFingerprint",
  "context",
  "contextDigestB64u",
  "ciphertextB64u",
]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function text(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail("TRUST_EVALUATION_PORTAL_INBOX_INVALID_INPUT", `${name} is required`);
  return normalized;
}

function iso(value, name) {
  const normalized = text(value, name);
  if (Number.isNaN(Date.parse(normalized))) {
    fail("TRUST_EVALUATION_PORTAL_INBOX_INVALID_TIME", `${name} must be an ISO-8601 date`);
  }
  return normalized;
}

function assertSession(session) {
  const principal = session?.principal;
  if (
    session?.role !== "evaluation_portal" ||
    principal?.status !== "active" ||
    !principal?.organizationId ||
    !principal?.enrollmentId ||
    !Array.isArray(principal?.scopes) ||
    !principal.scopes.includes("trust:evaluation:portal")
  ) {
    fail("TRUST_EVALUATION_PORTAL_INBOX_UNAUTHORIZED", "active evaluation portal session required");
  }
  return principal;
}

function normalizeEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    fail("TRUST_EVALUATION_PORTAL_INBOX_INVALID_ENVELOPE", "sealed envelope is required");
  }
  for (const key of Object.keys(envelope)) {
    if (!ENVELOPE_KEYS.has(key)) {
      fail("TRUST_EVALUATION_PORTAL_INBOX_FORBIDDF_FIELD", `envelope.${key} is not permitted`);
    }
  }
  if (!envelope.context || typeof envelope.context !== "object" || Array.isArray(envelope.context)) {
    fail("TRUST_EVALUATION_PORTAL_INBOX_INVALID_ENVELOPE", "envelope.context is required");
  }
  const normalized = structuredClone(envelope);
  for (const value of [
    normalized.version,
    normalized.algorithm,
    normalized.recipientKeyFingerprint,
    normalized.contextDigestB64u,
    normalized.ciphertextB64u,
    normalized.context.tenantId,
    normalized.context.apiKeyId,
    normalized.context.expiresAt,
    normalized.context.correlationId,
  ]) {
    if (!String(value ?? "").trim()) {
      fail("TRUST_EVALUATION_PORTAL_INBOX_INVALID_ENVELOPE", "sealed envelope fields are incomplete");
    }
  }
  if (JSON.stringify(normalized).includes("PRIVATE KEY")) {
    fail("TRUST_EVALUATION_PORTAL_INBOX_PRIVATE_KEY_REJECTED", "private-key material is not permitted");
  }
  return Object.freeze(normalized);
}

function messageIdFor(enrollmentId, contextDigestB64u) {
  return createHash("sha256")
    .update(`trust-evaluation-portal-inbox:${enrollmentId}:${contextDigestB64u}`, "utf8")
    .digest("base64url");
}

function publicMetadata(record) {
  return Object.freeze({
    messageId: record.messageId,
    version: record.version,
    status: record.status,
    organizationId: record.organizationId,
    enrollmentId: record.enrollmentId,
    recipientKeyFingerprint: record.recipientKeyFingerprint,
    tenantId: record.tenantId,
    contextDigestB64u: record.contextDigestB64u,
    createdAt: record.createdAt,
    openedAt: record.openedAt,
  });
}

export function createGlobalTrustEvaluationPortalInbox({
  store,
  clock = () => new Date().toISOString(),
} = {}) {
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    fail("TRUST_EVALUATION_PORTAL_INBOX_INVALID_STORE", "store read/transaction required");
  }
  if (typeof clock !== "function") {
    fail("TRUST_EVALUATION_PORTAL_INBOX_INVALID_CLOCK", "clock must be a function");
  }

  return Object.freeze({
    async deliver({ organizationId, enrollmentId, envelope } = {}) {
      const org = text(organizationId, "organizationId");
      const enrollment = text(enrollmentId, "enrollmentId");
      const sealed = normalizeEnvelope(envelope);
      const createdAt = iso(clock(), "clock()");
      const messageId = messageIdFor(enrollment, sealed.contextDigestB64u);
      const record = Object.freeze({
        version: TRUST_EVALUATION_PORTAL_INBOX_VERSION,
        messageId,
        status: "available",
        organizationId: org,
        enrollmentId: enrollment,
        recipientKeyFingerprint: sealed.recipientKeyFingerprint,
        tenantId: sealed.context.tenantId,
        contextDigestB64u: sealed.contextDigestB64u,
        envelope: sealed,
        createdAt,
        openedAt: null,
      });

      const committed = await store.transaction((tx) => {
        const current = tx.get(COLLECTION, messageId);
        if (current) {
          if (
            current.organizationId !== org ||
            current.enrollmentId !== enrollment ||
            current.contextDigestB64u !== sealed.contextDigestB64u ||
            current.recipientKeyFingerprint !== sealed.recipientKeyFingerprint
          ) {
            fail("TRUST_EVALUATION_PORTAL_INBOX_CONFLICT", "portal inbox message conflict");
          }
          return Object.freeze({ created: false, record: current });
        }
        tx.put(COLLECTION, messageId, record, { ifAbsent: true });
        return Object.freeze({ created: true, record });
      });

      return Object.freeze({
        accepted: true,
        created: committed.result.created,
        transportReference: `portal-inbox:${committed.result.record.messageId}`,
        ...publicMetadata(committed.result.record),
        externalDeliveryOccurred: false,
        plaintextCredentialIncluded: false,
      });
    },

    async list({ session } = {}) {
      const principal = assertSession(session);
      const state = await store.read();
      const records = Object.values(state.collections?.[COLLECTION] ?? {})
        .filter(
          (record) =>
            record.organizationId === principal.organizationId &&
            record.enrollmentId === principal.enrollmentId,
        )
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map(publicMetadata);
      return Object.freeze(records);
    },

    async get({ session, messageId } = {}) {
      const principal = assertSession(session);
      const id = text(messageId, "messageId");
      const state = await store.read();
      const record = state.collections?.[COLLECTION]?.[id] ?? null;
      if (
        !record ||
        record.organizationId !== principal.organizationId ||
        record.enrollmentId !== principal.enrollmentId
      ) {
        fail("TRUST_EVALUATION_PORTAL_INBOX_NOT_FOUND", "portal inbox message not found");
      }
      return Object.freeze({
        ...publicMetadata(record),
        envelope: structuredClone(record.envelope),
      });
    },

    async acknowledge({ session, messageId } = {}) {
      const principal = assertSession(session);
      const id = text(messageId, "messageId");
      const openedAt = iso(clock(), "clock()");
      const committed = await store.transaction((tx) => {
        const current = tx.get(COLLECTION, id);
        if (
          !current ||
          current.organizationId !== principal.organizationId ||
          current.enrollmentId !== principal.enrollmentId
        ) {
          fail("TRUST_EVALUATION_PORTAL_INBOX_NOT_FOUND", "portal inbox message not found");
        }
        if (current.openedAt) return current;
        const next = Object.freeze({ ...current, status: "opened", openedAt });
        tx.put(COLLECTION, id, next);
        return next;
      });
      return publicMetadata(committed.result);
    },
  });
}
