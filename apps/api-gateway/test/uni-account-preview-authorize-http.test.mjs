import assert from "node:assert/strict";
import test from "node:test";

import { BrowserSessionHandoffError } from "@apidevelopers/auth-core/browser-session-handoff";

import {
  createUniAccountPreviewAuthorizeHttpApp,
  uniAccountPreviewAuthorizePath,
  uniAccountPreviewCallbackUrl,
  uniAccountPreviewTargetOrigin,
} from "../src/uni-account-preview-authorize-http.mjs";

const STATE = "s".repeat(43);
const CHALLENGE = "c".repeat(43);
const CODE = "h".repeat(43);

function baseApp() {
  return Object.freeze({
    async handleRequest(request = {}) {
      return Object.freeze({
        status: 404,
        headers: Object.freeze({ "content-type": "application/json" }),
        body: JSON.stringify({ delegated: true, url: request.url ?? "/" }),
      });
    },
  });
}

function authorizeUrl() {
  return `${uniAccountPreviewAuthorizePath}?state=${STATE}&code_challenge=${CHALLENGE}`;
}

test("authorize GET renders login form when browser session is absent", async () => {
  let issueCalls = 0;
  const app = createUniAccountPreviewAuthorizeHttpApp({
    app: baseApp(),
    loginBootstrap: { async login() { throw new Error("not_called"); } },
    handoffService: {
      async issue() {
        issueCalls += 1;
        throw new BrowserSessionHandoffError("source_session_required", { status: 401 });
      },
    },
  });

  const result = await app.handleRequest({
    method: "GET",
    url: authorizeUrl(),
    headers: {},
  });

  assert.equal(issueCalls, 1);
  assert.equal(result.status, 200);
  assert.match(result.headers["content-type"], /^text\/html/);
  assert.match(result.body, /Entrar na Conta uni\./);
  assert.match(result.body, new RegExp(`name="state" value="${STATE}"`));
  assert.match(result.body, new RegExp(`name="code_challenge" value="${CHALLENGE}"`));
  assert.equal(result.body.includes("password="), false);
});

test("authorize POST authenticates locally and redirects back without putting password in URL", async () => {
  let loginInput;
  const app = createUniAccountPreviewAuthorizeHttpApp({
    app: baseApp(),
    loginBootstrap: {
      async login(input) {
        loginInput = input;
        return { setCookie: "__Host-apidevelopers-session=opaque; Path=/; HttpOnly; Secure; SameSite=Lax" };
      },
    },
    handoffService: { async issue() { throw new Error("not_called"); } },
  });

  const body = new URLSearchParams({
    state: STATE,
    code_challenge: CHALLENGE,
    email: "cliente@example.com",
    password: "Segredo#123",
  }).toString();

  const result = await app.handleRequest({
    method: "POST",
    url: uniAccountPreviewAuthorizePath,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  assert.equal(result.status, 303);
  assert.equal(loginInput.host, "uni-preview.apidevelopers.digital");
  assert.equal(loginInput.email, "cliente@example.com");
  assert.equal(loginInput.password, "Segredo#123");
  assert.equal(result.headers.location, authorizeUrl());
  assert.match(result.headers["set-cookie"], /^__Host-apidevelopers-session=/);
  assert.equal(result.headers.location.includes("Segredo"), false);
  assert.equal(result.headers.location.includes("cliente%40example.com"), false);
});

test("authorize GET with authenticated session issues S256 handoff and redirects to fixed Conta uni callback", async () => {
  let issueInput;
  const app = createUniAccountPreviewAuthorizeHttpApp({
    app: baseApp(),
    loginBootstrap: { async login() { throw new Error("not_called"); } },
    handoffService: {
      async issue(input) {
        issueInput = input;
        return Object.freeze({
          version: "browser-session-handoff/v1",
          code: CODE,
          targetOrigin: uniAccountPreviewTargetOrigin,
          expiresAt: "2026-09-11T23:00:00.000Z",
        });
      },
    },
  });

  const result = await app.handleRequest({
    method: "GET",
    url: authorizeUrl(),
    headers: { cookie: "__Host-apidevelopers-session=opaque" },
  });

  assert.equal(result.status, 303);
  assert.equal(issueInput.targetOrigin, uniAccountPreviewTargetOrigin);
  assert.equal(issueInput.codeChallenge, CHALLENGE);
  assert.equal(issueInput.headers.cookie, "__Host-apidevelopers-session=opaque");

  const redirect = new URL(result.headers.location);
  const expected = new URL(uniAccountPreviewCallbackUrl);
  assert.equal(redirect.origin + redirect.pathname, expected.origin + expected.pathname);
  assert.equal(redirect.searchParams.get("code"), CODE);
  assert.equal(redirect.searchParams.get("state"), STATE);
});

test("authorize rejects malformed state/challenge before authentication", async () => {
  let issueCalled = false;
  const app = createUniAccountPreviewAuthorizeHttpApp({
    app: baseApp(),
    loginBootstrap: { async login() { throw new Error("not_called"); } },
    handoffService: { async issue() { issueCalled = true; return {}; } },
  });

  const result = await app.handleRequest({
    method: "GET",
    url: `${uniAccountPreviewAuthorizePath}?state=bad&code_challenge=bad`,
  });

  assert.equal(result.status, 400);
  assert.equal(issueCalled, false);
  assert.equal(JSON.parse(result.body).error, "invalid_handoff_request");
});

test("authorize delegates unrelated routes unchanged", async () => {
  const app = createUniAccountPreviewAuthorizeHttpApp({
    app: baseApp(),
    loginBootstrap: { async login() { throw new Error("not_called"); } },
    handoffService: { async issue() { throw new Error("not_called"); } },
  });

  const result = await app.handleRequest({ method: "GET", url: "/health" });
  assert.equal(result.status, 404);
  assert.deepEqual(JSON.parse(result.body), { delegated: true, url: "/health" });
});
