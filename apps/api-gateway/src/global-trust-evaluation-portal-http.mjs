const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
});

function reply(status, payload) {
  return Object.freeze({
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

function requireService(value, methods, name) {
  if (!value || typeof value !== "object") {
    throw new TypeError(`${name} is required`);
  }
  for (const method of methods) {
    if (typeof value[method] !== "function") {
      throw new TypeError(`${name}.${method} must be a function`);
    }
  }
  return value;
}

function parseBody(body) {
  if (body === undefined || body === null || body === "") return {};
  if (typeof body !== "string") {
    const error = new Error("request body must be JSON text");
    error.code = "TRUST_EVALUATION_PORTAL_HTTP_INVALID_JSON";
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    const error = new Error("request body must be valid JSON");
    error.code = "TRUST_EVALUATION_PORTAL_HTTP_INVALID_JSON";
    throw error;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const error = new Error("request body must be a JSON object");
    error.code = "TRUST_EVALUATION_PORTAL_HTTP_INVALID_JSON";
    throw error;
  }
  return parsed;
}

function bearerToken(headers = {}) {
  const value = headers.authorization ?? headers.Authorization;
  const raw = Array.isArray(value) ? value[0] : value;
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(String(raw ?? "").trim());
  if (!match) {
    const error = new Error("portal bearer token required");
    error.code = "TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED";
    throw error;
  }
  return match[1];
}

function knownFailure(error) {
  const map = {
    TRUST_EVALUATION_PORTAL_HTTP_INVALID_JSON: [400, "invalid_json"],
    TRUST_EVALUATION_PORTAL_SESSION_INVALID_INPUT: [400, "invalid_input"],
    TRUST_EVALUATION_PORTAL_SESSION_INVALID_TIME: [400, "invalid_time"],
    TRUST_EVALUATION_PORTAL_SESSION_INVALID_TOKEN: [401, "invalid_session"],
    TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED: [401, "unauthorized"],
    TRUST_EVALUATION_PORTAL_SESSION_ENROLLMENT_REQUIRED: [403, "approved_enrollment_required"],
    TRUST_EVALUATION_PORTAL_SESSION_PROOF_MISMATCH: [403, "proof_mismatch"],
    TRUST_EVALUATION_KEY_PROOF_NOT_FOUND: [404, "challenge_not_found"],
    TRUST_EVALUATION_KEY_PROOF_EXPIRED: [410, "challenge_expired"],
    TRUST_EVALUATION_KEY_PROOF_REPLAY: [409, "challenge_replayed"],
    TRUST_EVALUATION_KEY_PROOF_INVALID_SIGNATURE: [403, "invalid_signature"],
    TRUST_EVALUATION_PORTAL_INBOX_UNAUTHORIZED: [401, "unauthorized"],
    TRUST_EVALUATION_PORTAL_INBOX_NOT_FOUND: [404, "message_not_found"],
    TRUST_EVALUATION_PORTAL_INBOX_INVALID_INPUT: [400, "invalid_input"],
  };
  return map[error?.code] ?? null;
}

function safeSession(session) {
  return Object.freeze({
    version: session.version,
    token: session.token,
    sessionId: session.sessionId,
    organizationId: session.organizationId,
    enrollmentId: session.enrollmentId,
    expiresAt: session.expiresAt,
    scopes: Object.freeze([...(session.scopes ?? [])]),
  });
}

async function authenticate(sessionService, headers) {
  return sessionService.authenticate({ token: bearerToken(headers) });
}

export function createGlobalTrustEvaluationPortalHttpHandler({
  portalSession,
  portalInbox,
} = {}) {
  const sessions = requireService(
    portalSession,
    ["begin", "complete", "authenticate", "revoke"],
    "portalSession",
  );
  const inbox = requireService(
    portalInbox,
    ["list", "get", "acknowledge"],
    "portalInbox",
  );

  return Object.freeze({
    async handleRequest({
      method = "GET",
      url = "/",
      headers = {},
      body,
    } = {}) {
      const requestUrl = new URL(String(url), "http://api-gateway.local");
      const pathname = requestUrl.pathname;
      const normalizedMethod = String(method).toUpperCase();

      try {
        if (
          normalizedMethod === "POST" &&
          pathname === "/v1/trust/evaluation/portal/session/challenge"
        ) {
          const payload = parseBody(body);
          const challenge = await sessions.begin({
            organizationId: payload.organizationId,
            correlationId: payload.correlationId,
          });
          return reply(200, {
            allowed: true,
            challenge,
            deliveryChannel: "in_product_portal",
            externalEnvelopeEgress: false,
          });
        }

        if (
          normalizedMethod === "POST" &&
          pathname === "/v1/trust/evaluation/portal/session"
        ) {
          const payload = parseBody(body);
          const session = await sessions.complete({
            organizationId: payload.organizationId,
            challengeId: payload.challengeId,
            signatureB64u: payload.signatureB64u,
          });
          return reply(200, {
            allowed: true,
            session: safeSession(session),
            deliveryChannel: "in_product_portal",
            externalEnvelopeEgress: false,
          });
        }

        if (
          normalizedMethod === "POST" &&
          pathname === "/v1/trust/evaluation/portal/session/revoke"
        ) {
          const revoked = await sessions.revoke({
            token: bearerToken(headers),
          });
          return reply(200, {
            allowed: true,
            sessionId: revoked.sessionId,
            revoked: revoked.revoked,
            revokedAt: revoked.revokedAt,
          });
        }

        if (
          normalizedMethod === "GET" &&
          pathname === "/v1/trust/evaluation/portal/inbox"
        ) {
          const session = await authenticate(sessions, headers);
          const messages = await inbox.list({ session });
          return reply(200, {
            allowed: true,
            messages,
            ciphertextIncluded: false,
            plaintextCredentialIncluded: false,
          });
        }

        const messageMatch =
          /^\/v1\/trust\/evaluation\/portal\/inbox\/([A-Za-z0-9_-]+)$/.exec(
            pathname,
          );
        if (normalizedMethod === "GET" && messageMatch) {
          const session = await authenticate(sessions, headers);
          const message = await inbox.get({
            session,
            messageId: messageMatch[1],
          });
          return reply(200, {
            allowed: true,
            message,
            ciphertextIncluded: true,
            plaintextCredentialIncluded: false,
          });
        }

        const acknowledgeMatch =
          /^\/v1\/trust\/evaluation\/portal\/inbox\/([A-Za-z0-9_-]+)\/ack$/.exec(
            pathname,
          );
        if (normalizedMethod === "POST" && acknowledgeMatch) {
          const session = await authenticate(sessions, headers);
          const message = await inbox.acknowledge({
            session,
            messageId: acknowledgeMatch[1],
          });
          return reply(200, {
            allowed: true,
            message,
            ciphertextIncluded: false,
            plaintextCredentialIncluded: false,
          });
        }

        return null;
      } catch (error) {
        const failure = knownFailure(error);
        if (!failure) throw error;
        return reply(failure[0], {
          allowed: false,
          reason: failure[1],
        });
      }
    },
  });
}
