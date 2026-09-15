import assert from "node:assert/strict";
import test from "node:test";

import {
  createUniCoPreviewLoginHttpApp,
  uniCoPreviewLoginHttpPath,
  uniCoPreviewSurfaceHostHeader,
} from "../src/web-agent-preview-login-http.mjs";

const origin = "https://mitra-preview.apidevelopers.digital";

test("preview login HTTP answers browser preflight for Mitra origin", async () => {
  const composed = createUniCoPreviewLoginHttpApp({
    app: { handleRequest: async () => ({ status: 404, headers: {}, body: "{}" }) },
    bootstrap: {
      async login() {
        throw new Error("should_not_login_on_preflight");
      },
    },
  });

  const result = await composed.app.handleRequest({
    method: "OPTIONS",
    url: uniCoPreviewLoginHttpPath,
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": `content-type, ${uniCoPreviewSurfaceHostHeader}`,
    },
  });

  assert.equal(result.status, 204);
  assert.equal(result.body, "");
  assert.equal(result.headers["access-control-allow-origin"], origin);
  assert.equal(result.headers["access-control-allow-credentials"], "true");
  assert.match(result.headers["access-control-allow-methods"], /POST/);
  assert.match(result.headers["access-control-allow-headers"], /content-type/);
  assert.match(result.headers["access-control-allow-headers"], new RegExp(uniCoPreviewSurfaceHostHeader));
});

test("preview login HTTP includes CORS headers on Mitra login responses", async () => {
  const composed = createUniCoPreviewLoginHttpApp({
    app: { handleRequest: async () => ({ status: 404, headers: {}, body: "{}" }) },
    bootstrap: {
      async login(input) {
        assert.equal(input.host, "mitra-preview.apidevelopers.digital");
        assert.equal(input.productId, "product:mitra");
        return {
          productId: "product:mitra",
          agentId: "mitra.professional",
          workspaceId: "workspace.preview.igor.mitra",
          accessGrantId: "grant.preview.igor.mitra",
          expiresAt: "2026-09-15T02:00:00.000Z",
          setCookie: "__Host-apidevelopers-session=test; Path=/; HttpOnly; Secure; SameSite=Lax",
        };
      },
    },
  });

  const result = await composed.app.handleRequest({
    method: "POST",
    url: uniCoPreviewLoginHttpPath,
    headers: {
      origin,
      [uniCoPreviewSurfaceHostHeader]: "mitra-preview.apidevelopers.digital",
    },
    body: JSON.stringify({
      email: "igor@sitedauni.com",
      password: "not-logged",
      productId: "product:mitra",
    }),
  });

  assert.equal(result.status, 200);
  assert.equal(result.headers["access-control-allow-origin"], origin);
  assert.equal(result.headers["access-control-allow-credentials"], "true");
  assert.equal(JSON.parse(result.body).productId, "product:mitra");
});

test("preview login HTTP rejects disallowed preflight origins", async () => {
  const composed = createUniCoPreviewLoginHttpApp({
    app: { handleRequest: async () => ({ status: 404, headers: {}, body: "{}" }) },
    bootstrap: { async login() {} },
  });

  const result = await composed.app.handleRequest({
    method: "OPTIONS",
    url: uniCoPreviewLoginHttpPath,
    headers: {
      origin: "https://evil.example",
    },
  });

  assert.equal(result.status, 403);
  assert.equal(JSON.parse(result.body).error, "preview_login_origin_not_allowed");
});
