import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ENROLLMENT_COLLECTION = "trust.evaluation.recipient_key_enrollments";
const SESSION_COLLECTION = "trust.evaluation.portal_sessions";

export const TRUST_EVALUATION_PORTAL_SESSION_VERSION =
  "trust-evaluation-portal-session/v1";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function text(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail("TRUST_EVALUATION_PORTAL_SESSION_INVALID_INPUT", `${name} is required`);
  return normalized;
}

function iso(value, name) {
  const normalized = text(value, name);
  if (Number.isNaN(Date.parse(normalized))) {
    fail("TRUST_EVALUATION_PORTAL_SESSION_INVALID_TIME", `${name} must be an ISO-8601 date`);
  }
  return normalized;
}

function normalizeTtl(value) {
  const normalized = value ?? 900_000;
  if (!Number.isSafeInteger(normalized) || normalized < 60_000 || normalized > 3_600_000) {
    fail(
      "TRUST_EVALUATION_PORTAL_SESSION_INVALID_TTL",
      "sessionTtlMs must be 60000..3600000",
    );
  }
  return normalized;
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseToken(token) {
  const normalized = text(token, "token");
  const match = /^trust_session_([A-Za-z0-9_-]{16,})\.([A-Za-z0-9_-]{32,})$/.exec(normalized);
  if (!match) {
    fail("TRUST_EVALUATION_PORTAL_SESSION_INVALID_TOKEN", "invalid portal session token");
  }
  return Object.freeze({ token: normalized, sessionId: match[1] });
}

export function trustEvaluationEnrollmentIdFor(organizationId) {
  return createHash("sha256")
    .update(
      `trust-evaluation-recipient-key-enrollment:${text(organizationId, "organizationId")}`,
      "utf8",
    )
    .digest("base64url");
}

function normalizeEnrollment(record, organizationId) {
  const possessionVerified =
    record?.keyPossessionVerified === true ||
    record?.proof?.keyPossessionVerified === true;
  const identityNotVerifiedByService =
    record?.identityVerifiedByThisService === false ||
    record?.identityVerification?.performedByThisService === false;

  if (
    !record ||
    record.status !== "approved" ||
    record.organizationId !== organizationId ||
    !possessionVerified ||
    !identityNotVerifiedByService ||
    !record.enrollmentId ||
    !record.recipientPublicKeySpkiPem ||
    !record.recipientKeyFingerprint
  ) {
    fail(
      "TRUST_EVALUATION_PORTAL_SESSION_ENROLLMENT_REQUIRED",
      "approved recipient key enrollment is required",
    );
  }

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
  if (
    !store ||
    typeof store.read !== "function" ||
    typeof store.transaction !== "function"
  ) {
    fail(
      "TRUST_EVALUATION_PORTAL_SESSION_INVALID_STORE",
      "store read/transaction required",
    );
  }
  if (
    !recipientKeyProofService ||
    typeof recipientKeyProofService.issueChallenge !== "function" ||
    typeof recipientKeyProofService.verifyAndConsume !== "function"
  ) {
    fail(
      "TRUST_EVALUATION_PORTAL_SESSION_INVALID_PROOF_SERVICE",
      "recipient key proof service required",
    );
  }
  if (typeof clock !== "function" || typeof randomBytesFn !== "function") {
    fail(
      "TRUST_EVALUATION_PORTAL_SESSION_INVALID_DEPENDENCY",
      "clock/randomBytesFn required",
   );
  }

  const configuredTtlMs = normalizeTtl(sessionTtlMs);

  async function approvedEnrollment(organizationId) {
    const normalizedOrganizationId = text(organizationId, "organizationId");
    const enrollmentId = trustEvaluationEnrolmentIdFor(normalizedOrganizationId);
    const state = await store.read();
    const record =
      state.collections?.[ENROLLMENT_COLLECTION]?.[enrollmentId] ?? null;
    return normalizeEnrollment(record, normalizedOrganizationId);
  }

  return Object.freeze({
    async begin({ organizationId, correlationId } = {}) {
      const normalizedOrganizationId = text(organizationId, "organizationId");
      const enrollment = await approvedEnrollment(normalizedOrganizationId);
      const challenge = await recipientKeyProofService.issueChallenge({
        organizationId: normalizedOrganizationId,
        recipientPublicKey: enrollment.recipientPublicKeySpkiPem,
        correlationId: text(correlationId, "correlationId"),
        ttlMs: 120_000,
      });
      return Object.freeze({
        version: TRUST_EVALUATION_PORTAL_SESSION_VERSION,
        organizationId: normalizedOrganizationId,
        enrollmentId: enrollment.enrollmentId,
        challengeId: challenge.challengeId,
        signingPayloadB64u: challenge.signingPayloadB64u,
        algorithm: challenge.algorithm,
        expiresAt: challenge.expiresAt,
      });
    },

    async complete({ organizationId, challengeId, signatureB64u } = {}) {
      const normalizedOrganizationId = text(organizationId, "organizationId");
      const enrollment = await approvedEnrollment(normalizedOrganizationId);
      const proof = await recipientKeyProofService.verifyAndConsume({
        challengeId: text(challengeId, "challengeId"),
        recipientPublicKey: enrollment.recipientPublicKeySpkiPem,
        signatureB64u: text(signatureB64u, "signatureB64u"),
      });

      if (
        proof.organizationId !== normalizedOrganizationId ||
        proof.recipientKeyFingerprint !== enrollment.recipientKeyFingerprint ||
        proof.keyPossessionVerified !== true
      ) {
        fail(
          "TRUST_EVALUATION_PORTAL_SESSION_PROOF_MISMATCH",
          "proof does not match approved enrollment",
        );
      }

      const issuedAt = iso(clock(), "clock()");
      const expiresAt = new Date(
        Date.parse(issuedAt) + configuredTtlMs,
      ).toISOString();
      const sessionId = Buffer.from(randomBytesFn(18)).toString("base64url");
      const secret = Buffer.from(randomBytesFn(32)).toString("base64url");
     if (sessionId.length < 16 || secret.length < 32) {
        fail(
          "TRUST_EVALUATION_PORTAL_SESSION_WEAK_RANDOM",
          "strong session randomness required",
        );
      }

      const token = `trust_session_${sessionId}.${secret}`;
      const record = Object.freeze({
        version: TRUST_EVALUATION_PORTAL_SESSION_VERSION,
        sessionId,
        tokenDigest: digest(token),
        status: "active",
        organizationId: normalizedOrganizationId,
        enrollmentId: enrollment.enrollmentId,
        recipientKeyFingerprint: enrollment.recipientKeyFingerprint,
        scopes: Object.freeze(["trust:evaluation:portal"]),
        issuedAt,
        expiresAt,
        revokedAt: null,
      });

      await store.transaction((tx) => {
        if (tx.get(SESSION_COLLECTION, sessionId)) {
          fail(
            "TRUST_EVALUATION_PORTAL_SESSION_CONFLICT",
            "session id collision",
          );
        }
        tx.put(SESSION_COLLECTION, sessionId, record, { ifAbsent: true });
        return record;
      });

      return Object.freeze({
        version: TRUST_EVALUATION_PORTAL_SESSION_VERSION,
        token,
        sessionId,
        organizationId: normalizedOrganizationId,
        enrollmentId: enrollment.enrollmentId,
        expiresAt,
        scopes: Object.freez(["trust:evaluation:portal"]),
      });
    },

    async authenticate({ token } = {}) {
      const parsed = parseToken(token);
      const now = iso(clock(), "clock()");
      const state = await store.read();
      const record =
        state.collections?.[SESSION_COLLECTION]?.[parsed.sessionId] ?? null;

      if (
        !record ||
        record.status !== "active" ||
        !safeEqual(record.tokenDigest, digest(parsed.token)) ||
        Date.parse(now) >= Date.parse(record.expiresAt)
      ) {
        fail(
          "TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED",
          "portal session is invalid or expired",
        );
      }

      const enrollment = await approvedEnrolment(record.organizationId);
      if (
        enrollment.enrollmentId !== record.enrollmentId ||
        enrollment.recipientKeyFingerprint !== record.recipientKeyFingerprint
      ) {
        fail(
          "TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED",
          "portal session no longer matches approved enrollment",
        );
      }

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
      const parsed = parseToken(token);
      const now = iso(clock(), "clock()");
      const committed = await store.transaction((tx) => {
        const current = tx.get(SESSION_COLLECTION, parsed.sessionId);
        if (
          !current ||
          current.status !== "active" ||
          !safeEqual(current.tokenDigest, digest(parsed.token))
        ) {
          fail(
            "TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED",
            "portal session is invalid",
          );
        }
        const next = Object.freeze({
          ...current,
          status: "revoked",
          revokedAt: now,
        });
        tx.put(SESSION_COLLECTION, parsed.sessionId, next);
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
