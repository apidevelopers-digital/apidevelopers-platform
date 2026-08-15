import assert from "node:assert/strict";
import test from "node:test";

import { createGlobalTrustEvaluationPortalHttpHandler } from "../src/global-trust-evaluation-portal-http.mjs";

const TOKEN = "trust_session_abcdefghijklmnop.abcdefghijklmnopqrstuvwxyz012345";
const ENVELOPE = Object.freeze({
  version: "trust-evaluation-credential-envelope/v1",
  algorithm: "RSA-OAEP-256+A256GCM",
  recipientKeyFingerprint: "YWJjZGVmZ2hpamtsbW5vcA",
  context: Object.freeze({
    tenantId: "tenant-http",
    apiKeyId: "key-http",
    expiresAt: "2026-08-28T18:00:00.000Z",
    correlationId: "corr-http",
  }),
  contextDigestB64u: "YWJjZGVmZ2hpamtsbW5vcHFyc3Q",
  ciphertextB64u: "Y2lwaGVydGV4dC1vbmx5LW5vdC1wbGFpbnRleHQ",
});
const MESSAGE = Object.freeze({
  messageId: "msg_abc123",
  version: "trust-evaluation-portal-inbox/v1",
  status: "available",
  organizationId: "component.organization.http",
  enrollmentId: "enrollment-http",
  recipientKeyFingerprint: ENVELOPE.recipientKeyFingerprint,
  tenantId: ENVELOPE.context.tenantId,
  contextDigestB64u: ENVELOPE.contextDigestB64u,
  createdAt: "2026-08-14T18:00:00.000Z",
  openedAt: null,
});
const SESSION_IDENTITY = Object.freeze({
  role: "evaluation_portal",
  principal: Object.freeze({
    id: "session-http",
    organizationId: MESSAGE.organizationId,
    enrollmentId: MESSAGE.enrollmentId,
    recipientKeyFingerprint: MESSAGE.recipientKeyFingerprint,
    scopes: Object.freeze(["trust:evaluation:portal"]),
    status: "active",
  }),
  expiresAt: "2026-08-14T18:15:00.000Z",
});

function parse(response) {
  return JSON.parse(response.body);
}

function makeHandler() {
  const calls = [];
  const portalSession = {
    async begin(input) {
      calls.push(["begin", input]);
      return {
        version: "trust-evaluation-portal-session/v1",
        organizationId: input.organizationId,
        enrollmentId: MESSAGE.enrollmentId,
        challengeId: "challenge-http",
        signingPayloadB64u: "c2lnbi10aGlz",
        algorithm: "RSA-PSS-SHA256",
        expiresAt: "2026-08-14T18:02:00.000Z",
      };
    },
    async complete(input) {
      calls.push(["complete", input]);
      return {
        version: "trust-evaluation-portal-session/v1",
        token: TOKEN,
        sessionId: "session-http",
        organizationId: input.organizationId,
        enrollmentId: MESSAGE.enrollmentId,
        expiresAt: "2026-08-14T18:15:00.000Z",
        scopes: ["trust:evaluation:portal"],
      };
    },
    async authenticate({ token }) {
      calls.push(["authenticate", token]);
      if (token !== TOKEN) {
        const error = new Error("unauthorized");
        error.code = "TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED";
        throw error;
      }
      return SESSION_IDENTITY;
    },
    async revoke({ token }) {
      calls.push(["revoke", token]);
      if (token !== TOKEN) {
        const error = new Error("unauthorized");
        error.code = "TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED";
        throw error;
      }
      return {
        sessionId: "session-http",
        revoked: true,
        revokedAt: "2026-08-14T18:01:00.000Z",
      };
    },
  };
  const portalInbox = {
    async list({ session }) {
      calls.push(["list", session]);
      return Object.freeze([MESSAGE]);
    },
    async get({ session, messageId }) {
      calls.push(["get", session, messageId]);
      if (messageId !== MESSAGE.messageId) {
        const error = new Error("missing");
        error.code = "TRUST_EVALUATION_PORTAL_INBOX_NOT_FOUND";
        throw error;
      }
      return Object.freeze({ ...MESSAGE, envelope: ENVELOPE });
    },
    async acknowledge({ session, messageId }) {
      calls.push(["acknowledge", session, messageId]);
      return Object.freeze({
        ...MESSAGE,
        status: "opened",
        openedAt: "2026-08-14T18:01:30.000Z",
      });
    },
  };
  return {
    handler: createGlobalTrustEvaluationPortalHttpHandler({
      portalSession,
      portalInbox,
    }),
    calls,
  };
}

test("portal challenge and session routes are no-store and in-product only", async () => {
  const { handler, calls } = makeHandler();

  const challenge = await handler.handleRequest({
    method: "POST",
    url: "/v1/trust/evaluation/portal/session/challenge",
    body: JSON.stringify({
      organizationId: MESSAGE.organizationId,
      correlationId: "corr-http",
    }),
  });
  assert.equal(challenge.status, 200);
  assert.equal(challenge.headers["cache-control"], "no-store, max-age=0");
  assert.equal(challenge.headers["referrer-policy"], "no-referrer");
  const challengeBody = parse(challenge);
  assert.equal(challengeBody.allowed, true);
  assert.equal(challengeBody.deliveryChannel, "in_product_portal");
  assert.equal(challengeBody.externalEnvelopeEgress, false);
  assert.equal(challengeBody.challenge.challengeId, "challenge-http");

  const session = await handler.handleRequest({
    method: "POST",
    url: "/v1/trust/evaluation/portal/session",
    body: JSON.stringify({
      organizationId: MESSAGE.organizationId,
      challengeId: "challenge-http",
      signatureB64u: "c2lnbmF0dXJl",
    }),
  });
  assert.equal(session.status, 200);
  assert.equal(session.headers["cache-control"], "no-store, max-age=0");
  const sessionBody = parse(session);
  assert.equal(sessionBody.session.token, TOKEN);
  assert.equal(sessionBody.deliveryChannel, "in_product_portal");
  assert.equal(sessionBody.externalEnvelopeEgress, false);
  assert.deepEqual(calls[0][0], "begin");
  assert.deepEqual(calls[1][0], "complete");
});

test("invalid JSON is rejected before services are called", async () => {
  const { handler, calls } = makeHandler();
  const response = await handler.handleRequest({
    method: "POST",
    url: "/v1/trust/evaluation/portal/session/challenge",
    body: "{not-json",
  });
  assert.equal(response.status, 400);
  assert.equal(parse(response).reason, "invalid_json");
  assert.equal(calls.length, 0);
});

test("inbox requires portal bearer session and API key alone is not accepted", async () => {
  const { handler, calls } = makeHandler();

  const missing = await handler.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation/portal/inbox",
    headers: { "x-api-key": "not-a-portal-login" },
  });
  assert.equal(missing.status, 401);
  assert.equal(parse(missing).reason, "unauthorized");
  assert.equal(calls.length, 0);

  const invalid = await handler.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation/portal/inbox",
    headers: { authorization: "Bearer wrong.token" },
  });
  assert.equal(invalid.status, 401);
  assert.equal(parse(invalid).reason, "unauthorized");
  assert.equal(calls[0][0], "authenticate");
});

test("inbox list returns metadata only and message GET returns sealed ciphertext only", async () => {
  const { handler } = makeHandler();
  const headers = { authorization: `Bearer ${TOKEN}` };

  const list = await handler.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation/portal/inbox",
    headers,
  });
  assert.equal(list.status, 200);
  const listBody = parse(list);
  assert.equal(listBody.ciphertextIncluded, false);
  assert.equal(listBody.plaintextCredentialIncluded, false);
  assert.equal(listBody.messages.length, 1);
  assert.equal("envelope" in listBody.messages[0], false);
  assert.equal(JSON.stringify(listBody).includes(ENVELOPE.ciphertextB64u), false);

  const get = await handler.handleRequest({
    method: "GET",
    url: `/v1/trust/evaluation/portal/inbox/${MESSAGE.messageId}`,
    headers,
  });
  assert.equal(get.status, 200);
  assert.equal(get.headers["cache-control"], "no-store, max-age=0");
  const getBody = parse(get);
  assert.equal(getBody.ciphertextIncluded, true);
  assert.equal(getBody.plaintextCredentialIncluded, false);
  assert.equal(getBody.message.envelope.ciphertextB64u, ENVELOPE.ciphertextB64u);
  assert.equal(JSON.stringify(getBody).includes("plaintextApiKey"), false);
  assert.equal(JSON.stringify(getBody).includes("PRIVATE KEY"), false);
});

test("acknowledge and revoke require bearer session and return metadata only", async () => {
  const { handler } = makeHandler();
  const headers = { authorization: `Bearer ${TOKEN}` };

  const ack = await handler.handleRequest({
    method: "POST",
    url: `/v1/trust/evaluation/portal/inbox/${MESSAGE.messageId}/ack`,
    headers,
  });
  assert.equal(ack.status, 200);
  const ackBody = parse(ack);
  assert.equal(ackBody.message.status, "opened");
  assert.equal(ackBody.ciphertextIncluded, false);
  assert.equal(ackBody.plaintextCredentialIncluded, false);

  const revoke = await handler.handleRequest({
    method: "POST",
    url: "/v1/trust/evaluation/portal/session/revoke",
    headers,
  });
  assert.equal(revoke.status, 200);
  const revokeBody = parse(revoke);
  assert.equal(revokeBody.revoked, true);
  assert.equal(revokeBody.sessionId, "session-http");
  assert.equal("token" in revokeBody, false);
});

test("portal HTTP surface does not expose admin or provisioning routes", async () => {
  const { handler, calls } = makeHandler();
  for (const url of [
    "/v1/trust/evaluation/portal/admin",
    "/v1/trust/evaluation/portal/provision",
    "/v1/trust/evaluation/recipient-key/enroll",
    "/v1/trust/evaluation",
  ]) {
    const response = await handler.handleRequest({ method: "POST", url, body: "{}" });
    assert.equal(response, null);
  }
  assert.equal(calls.length, 0);
});
