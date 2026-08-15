import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ENROLLMENTS = "trust.evaluation.recipient_key_enrollments";
const SESSIONS = "trust.evaluation.portal_sessions";
const SCOPE = "trust:evaluation:portal";
export const TRUST_EVALUATION_PORTAL_SESSION_VERSION = "trust-evaluation-portal-session/v1";

function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
function text(value, name) {
  const v = String(value ?? "").trim();
  if (!v) fail("TRUST_EVALUATION_PORTAL_SESSION_INVALID_INPUT", `${name} is required`);
  return v;
}
function iso(value, name) {
  const v = text(value, name);
  if (Number.isNaN(Date.parse(v))) fail("TRUST_EVALUATION_PORTAL_SESSION_INVALID_TIME", `${name} must be ISO-8601`);
  return v;
}
function digest(value) { return createHash("sha256").update(value, "utf8").digest("base64url"); }
function equal(a, b) {
  const x = Buffer.from(String(a ?? ""), "utf8"), y = Buffer.from(String(b ?? ""), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}
function ttl(value) {
  const v = value ?? 900_000;
  if (!Number.isSafeInteger(v) || v < 60_000 || v > 3_600_000)
    fail("TRUST_EVALUATION_PORTAL_SESSION_INVALID_TTL", "sessionTtlMs must be 60000..3600000");
  return v;
}
function parseToken(token) {
  const value = text(token, "token");
  const m = /^trust_session_([A-Za-z0-9_-]{16,})\.([A-Za-z0-9_-]{32,})$/.exec(value);
  if (!m) fail("TRUST_EVALUATION_PORTAL_SESSION_INVALID_TOKEN", "invalid portal session token");
  return { token: value, sessionId: m[1] };
}
export function trustEvaluationEnrollmentIdFor(organizationId) {
  return createHash("sha256")
    .update(`trust-evaluation-recipient-key-enrollment:${text(organizationId, "organizationId")}`, "utf8")
    .digest("base64url");
}
function normalizeEnrollment(record, organizationId) {
  const possession = record?.keyPossessionVerified === true || record?.proof?.keyPossessionVerified === true;
  const externalIdentity =
    record?.identityVerifiedByThisService === false ||
    record?.identityVerification?.performedByThisService === false;
  if (
    !record || record.status !== "approved" || record.organizationId !== organizationId ||
    !possession || !externalIdentity || !record.enrollmentId ||
    !record.recipientPublicKeySpkiPem || !record.recipientKeyFingerprint
  ) fail("TRUST_EVALUATION_PORTAL_SESSION_ENROLLMENT_REQUIRED", "approved recipient key enrollment is required");
  return Object.freeze({
    enrollmentId: record.enrollmentId,
    organizationId: record.organizationId,
    recipientPublicKeySpkiPem: record.recipientPublicKeySpkiPem,
    recipientKeyFingerprint: record.recipientKeyFingerprint,
  });
}

export function createGlobalTrustEvaluationPortalSessionService({
  store,
  recipientKeyProofService,
  clock = () => new Date().toISOString(),
  randomBytesFn = randomBytes,
  sessionTtlMs = 900_000,
} = {}) {
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function")
    fail("TRUST_EVALUATION_PORTAL_SESSION_INVALID_STORE", "store read/transaction required");
  if (
    !recipientKeyProofService ||
    typeof recipientKeyProofService.issueChallenge !== "function" ||
    typeof recipientKeyProofService.verifyAndConsume !== "function"
  ) fail("TRUST_EVALUATION_PORTAL_SESSION_INVALID_PROOF_SERVICE", "recipient key proof service required");
  if (typeof clock !== "function" || typeof randomBytesFn !== "function")
    fail("TRUST_EVALUATION_PORTAL_SESSION_INVALID_DEPENDENCY", "clock/randomBytesFn required");
  const sessionLifetime = ttl(sessionTtlMs);

  async function approvedEnrollment(organizationId) {
    const org = text(organizationId, "organizationId");
    const id = trustEvaluationEnrollmentIdFor(org);
    const state = await store.read();
    return normalizeEnrollment(state.collections?.[ENROLLMENTS]?.[id] ?? null, org);
  }

  return Object.freeze({
    async begin({ organizationId, correlationId } = {}) {
      const org = text(organizationId, "organizationId");
      const enrollment = await approvedEnrollment(org);
      const challenge = await recipientKeyProofService.issueChallenge({
        organizationId: org,
        recipientPublicKey: enrollment.recipientPublicKeySpkiPem,
        correlationId: text(correlationId, "correlationId"),
        ttlMs: 120_000,
      });
      return Object.freeze({
        version: TRUST_EVALUATION_PORTAL_SESSION_VERSION,
        organizationId: org,
        enrollmentId: enrollment.enrollmentId,
        challengeId: challenge.challengeId,
        signingPayloadB64u: challenge.signingPayloadB64u,
        algorithm: challenge.algorithm,
        expiresAt: challenge.expiresAt,
      });
    },

    async complete({ organizationId, challengeId, signatureB64u } = {}) {
      const org = text(organizationId, "organizationId");
      const enrollment = await approvedEnrollment(org);
      const proof = await recipientKeyProofService.verifyAndConsume({
        challengeId: text(challengeId, "challengeId"),
        recipientPublicKey: enrollment.recipientPublicKeySpkiPem,
        signatureB64u: text(signatureB64u, "signatureB64u"),
      });
      if (
        proof.organizationId !== org ||
        proof.recipientKeyFingerprint !== enrollment.recipientKeyFingerprint ||
        proof.keyPossessionVerified !== true
      ) fail("TRUST_EVALUATION_PORTAL_SESSION_PROOF_MISMATCH", "proof does not match approved enrollment");

      const issuedAt = iso(clock(), "clock()");
      const expiresAt = new Date(Date.parse(issuedAt) + sessionLifetime).toISOString();
      const sessionId = Buffer.from(randomBytesFn(18)).toString("base64url");
      const secret = Buffer.from(randomBytesFn(32)).toString("base64url");
      if (sessionId.length < 16 || secret.length < 32)
        fail("TRUST_EVALUATION_PORTAL_SESSION_WEAK_RANDOM", "strong session randomness required");
      const token = `trust_session_${sessionId}.${secret}`;
      const record = Object.freeze({
        version: TRUST_EVALUATION_PORTAL_SESSION_VERSION,
        sessionId,
        tokenDigest: digest(token),
        status: "active",
        organizationId: org,
        enrollmentId: enrollment.enrollmentId,
        recipientKeyFingerprint: enrollment.recipientKeyFingerprint,
        scopes: Object.freeze([SCOPE]),
        issuedAt,
        expiresAt,
        revokedAt: null,
      });
      await store.transaction((tx) => {
        if (tx.get(SESSIONS, sessionId))
          fail("TRUST_EVALUATION_PORTAL_SESSION_CONFLICT", "session id collision");
        tx.put(SESSIONS, sessionId, record, { ifAbsent: true });
        return record;
      });
      return Object.freeze({
        version: TRUST_EVALUATION_PORTAL_SESSION_VERSION,
        token,
        sessionId,
        organizationId: org,
        enrollmentId: enrollment.enrollmentId,
        expiresAt,
        scopes: Object.freeze([SCOPE]),
      });
    },

    async authenticate({ token } = {}) {
      const parsed = parseToken(token), now = iso(clock(), "clock()");
      const state = await store.read();
      const record = state.collections?.[SESSIONS]?.[parsed.sessionId] ?? null;
      if (
        !record || record.status !== "active" ||
        !equal(record.tokenDigest, digest(parsed.token)) ||
        Date.parse(now) >= Date.parse(record.expiresAt)
      ) fail("TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED", "portal session is invalid or expired");
      const enrollment = await approvedEnrollment(record.organizationId);
      if (
        enrollment.enrollmentId !== record.enrollmentId ||
        enrollment.recipientKeyFingerprint !== record.recipientKeyFingerprint
      ) fail("TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED", "portal session no longer matches approved enrollment");
      return Object.freeze({
        role: "evaluation_portal",
        principal: Object.freeze({
          id: record.sessionId,
          organizationId: record.organizationId,
          enrollmentId: record.enrollmentId,
          recipientKeyFingerprint: record.recipientKeyFingerprint,
          scopes: Object.freeze([...record.scopes]),
          status: "active",
        }),
        expiresAt: record.expiresAt,
      });
    },

    async revoke({ token } = {}) {
      const parsed = parseToken(token), revokedAt = iso(clock(), "clock()");
      const committed = await store.transaction((tx) => {
        const current = tx.get(SESSIONS, parsed.sessionId);
        if (!current || current.status !== "active" || !equal(current.tokenDigest, digest(parsed.token)))
          fail("TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED", "portal session is invalid");
        const next = Object.freeze({ ...current, status: "revoked", revokedAt });
        tx.put(SESSIONS, parsed.sessionId, next);
        return next;
      });
      return Object.freeze({
        sessionId: committed.result.sessionId,
        revoked: true,
        revokedAt: committed.result.revokedAt,
      });
    },
  });
}
