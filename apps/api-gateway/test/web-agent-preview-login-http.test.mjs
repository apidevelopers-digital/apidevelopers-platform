import assert from "node:assert/strict";
import test from "node:test";

import { createUniCoPreviewLoginHttpApp, uniCoPreviewLoginHttpPath } from "../src/web-agent-preview-login-http.mjs";

test("preview login HTTP sets the institutional cookie and never returns secrets", async () => {
  const calls = [];
  const fallback = { handleRequest: async () => ({ status: 404, headers: {}, body: "{}" }) };
  const composed = createUniCoPreviewLoginHttpApp({
    app: fallback,
    bootstrap: {
      async login(input) {
        calls.push(input);
        return {
          productId: "product:uni-co",
          agentId: "uni.co",
          workspaceId: "workspace.preview.1",
          accessGrantId: "grant.preview.1",
          expiresAt: "2026-08-19T15:30:00.000Z",
          setCookie: "__Host-apidevelopers-session=raw-secret; Path=/; HttpOnly; Secure; SameSite=Lax",
        };
      },
    },
  });

  const result = await composed.app.handleRequest({
    method: "POST",
    url: uniCoPreviewLoginHttpPath,
    headers: { host: "unico-preview.apidevelopers.digital" },
    body: JSON.stringify({ email: "igor@example.com", password: "Preview#123" }),
  });

  assert.equal(result.status, 200);
  assert.match(result.headers["set-cookie"], /^__Host-apidevelopers-session=/);
  assert.deepEqual(calls, [{
    host: "unico-preview.apidevelopers.digital",
    email: "igor@example.com",
    password: "Preview#123",
  }]);
  assert.equal(result.body.includes("Preview#123"), false);
  assert.equal(result.body.includes("raw-secret"), false);
  assert.equal(JSON.parse(result.body).authenticated, true);
});

test("preview login HTTP returns generic invalid credentials", async () => {
  const fallback = { handleRequest: async () => ({ status: 404, headers: {}, body: "{}" }) };
  const composed = createUniCoPreviewLoginHttpApp({
    app: fallback,
    bootstrap: {
      async login() {
        throw new Error("invalid_credentials");
      },
    },
  });

  const result = await composed.app.handleRequest({
    method: "POST",
    url: uniCoPreviewLoginHttpPath,
    headers: { host: "unico-preview.apidevelopers.digital" },
    body: JSON.stringify({ email: "x@y.z", password: "bad" }),
  });

  assert.equal(result.status, 401);
  assert.deepEqual(JSON.parse(result.body), {
    ok: false,
    authenticated: false,
    error: "invalid_credentials",
  });
});

test("preview login HTTP is disabled when identity verifier/bootstrap is absent", async () => {
  const fallbackResult = { status: 404, headers: {}, body: JSON.stringify({ error: "not_found" }) };
  const fallback = { handleRequest: async () => fallbackResult };
  const composed = createUniCoPreviewLoginHttpApp({ app: fallback });

  assert.equal(composed.enabled, false);
  assert.equal(await composed.app.handleRequest({ method: "POST", url: uniCoPreviewLoginHttpPath }), fallbackResult);
});
