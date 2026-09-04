import assert from "node:assert/strict";
import test from "node:test";

import {
  browserSessionHandoffIssuePath,
  browserSessionHandoffRedeemPath,
  createBrowserSessionHandoffHttpApp,
} from "../src/browser-session-handoff-http.mjs";

function fallbackApp() {
  return {
    async handleRequest() {
      return { status: 404, headers: {}, body: "fallback" };
    },
  };
}

function handoffService() {
  return {
    async issue({ headers, targetOrigin, codeChallenge }) {
      return {
        version: "browser-session-handoff/v1",
        code: "A".repeat(43),
        targetOrigin,
        expiresAt: "2026-09-04T04:01:00.000Z",
        codeChallenge,
        sourceCookieObserved: headers.cookie ?? null,
      };
    },
    async redeem({ code, targetOrigin, codeVerifier }) {
      return {
        authenticated: true,
        principal: {
          id: "acct_1",
          tenantId: "tenant_1",
          scopes: ["campaigns:read"],
          authenticationMethod: "browser_session_handoff",
        },
        source: {
          targetOrigin,
          code,
          codeVerifier,
          browserBindingMethod: "S256",
        },
      };
    },
  };
}

function redeemerAuthenticator() {
  return {
    async authenticate(headers) {
      if (headers.authorization !== "Bearer redeemer") return null;
      return { role: "server", principal: { id: "site_uni" } };
    },
  };
}

test("stays disabled when runtime dependencies are absent", async () => {
  const fallback = fallbackApp();
  const wrapped = createBrowserSessionHandoffHttpApp({ app: fallback });
  assert.equal(wrapped.enabled, false);
  assert.deepEqual(
    await wrapped.app.handleRequest({}),
    await fallback.handleRequest({}),
  );
});

test("issue forwards source headers, target and S256 challenge", async () => {
  let received;
  const service = handoffService();
  const original = service.issue;
  service.issue = async (input) => {
    received = input;
    return original(input);
  };

  const wrapped = createBrowserSessionHandoffHttpApp({
    app: fallbackApp(),
    handoffService: service,
    redeemerAuthenticator: redeemerAuthenticator(),
    redeemTargetOrigin: "https://sitedauni.com",
  });

  const response = await wrapped.app.handleRequest({
    method: "POST",
    url: browserSessionHandoffIssuePath,
    headers: { cookie: "source=ok" },
    body: JSON.stringify({
      targetOrigin: "https://sitedauni.com",
      codeChallenge: "C".repeat(43),
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(received, {
    headers: { cookie: "source=ok" },
    targetOrigin: "https://sitedauni.com",
    codeChallenge: "C".repeat(43),
  });
  assert.equal(JSON.parse(response.body).handoff.code, "A".repeat(43));
});

test("redeem fixes target server-side and requires server authentication", async () => {
  let redeemedInput;
  const service = handoffService();
  const original = service.redeem;
  service.redeem = async (input) => {
    redeemedInput = input;
    return original(input);
  };

  const wrapped = createBrowserSessionHandoffHttpApp({
    app: fallbackApp(),
    handoffService: service,
    redeemerAuthenticator: redeemerAuthenticator(),
    redeemTargetOrigin: "https://sitedauni.com",
  });

  const payload = JSON.stringify({
    code: "A".repeat(43),
    codeVerifier: "v".repeat(43),
    targetOrigin: "https://evil.example",
  });

  const unauthorized = await wrapped.app.handleRequest({
    method: "POST",
    url: browserSessionHandoffRedeemPath,
    headers: {},
    body: payload,
  });
  assert.equal(unauthorized.status, 401);

  const response = await wrapped.app.handleRequest({
    method: "POST",
    url: browserSessionHandoffRedeemPath,
    headers: { authorization: "Bearer redeemer" },
    body: payload,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(redeemedInput, {
    code: "A".repeat(43),
    targetOrigin: "https://sitedauni.com",
    codeVerifier: "v".repeat(43),
  });
});

test("invalid json fails closed", async () => {
  const wrapped = createBrowserSessionHandoffHttpApp({
    app: fallbackApp(),
    handoffService: handoffService(),
    redeemerAuthenticator: redeemerAuthenticator(),
    redeemTargetOrigin: "https://sitedauni.com",
  });

  const response = await wrapped.app.handleRequest({
    method: "POST",
    url: browserSessionHandoffIssuePath,
    body: "{",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    authenticated: false,
    error: "invalid_json",
  });
});

test("unrelated routes delegate to the existing app", async () => {
  const wrapped = createBrowserSessionHandoffHttpApp({
    app: fallbackApp(),
    handoffService: handoffService(),
    redeemerAuthenticator: redeemerAuthenticator(),
    redeemTargetOrigin: "https://sitedauni.com",
  });

  const response = await wrapped.app.handleRequest({
    method: "GET",
    url: "/v1/health",
  });

  assert.deepEqual(response, { status: 404, headers: {}, body: "fallback" });
});
