import assert from "node:assert/strict";
import test from "node:test";

import { createUniCoPreviewLoginHttpApp } from "../src/web-agent-preview-login-http.mjs";
import {
  createUniCoPreviewBrowserSessionBootstrap,
  mitraPreviewAgentId,
  mitraPreviewLoginHost,
  mitraPreviewProductId,
} from "../src/web-agent-preview-session-bootstrap.mjs";
import { createUniCoPreviewSaasAccessResolver } from "../src/web-agent-preview-saas-access.mjs";

const T0 = new Date("2026-09-14T23:45:00.000Z");
const SECRET = "B".repeat(43);

test("preview bootstrap supports Mitra product binding without changing Uni defaults", async () => {
  const puts = [];
  let verifiedInput;
  let accessInput;
  const bootstrap = createUniCoPreviewBrowserSessionBootstrap({
    store: {
      async transaction(callback) {
        await callback({
          put(...args) {
            puts.push(args);
          },
        });
      },
    },
    clock: () => T0,
    generateSecret: () => SECRET,
    loginSurfaces: [
      {
        host: mitraPreviewLoginHost,
        productId: mitraPreviewProductId,
        agentId: mitraPreviewAgentId,
      },
    ],
    verifyCredentials: async (input) => {
      verifiedInput = input;
      return { name: "Igor" };
    },
    resolveAccess: async (input) => {
      accessInput = input;
      return {
        principalId: "principal.preview.igor",
        tenantId: "tenant.preview.igor",
        workspaceId: "workspace.preview.igor.mitra",
        accessGrantId: "grant.preview.igor.mitra",
      };
    },
  });

  const result = await bootstrap.login({
    host: mitraPreviewLoginHost,
    email: " IGOR@example.com ",
    password: "Mitra#123",
    productId: mitraPreviewProductId,
  });

  assert.deepEqual(verifiedInput, { email: "igor@example.com", password: "Mitra#123" });
  assert.equal(accessInput.productId, mitraPreviewProductId);
  assert.deepEqual(accessInput.requiredScopes, ["web:chat"]);
  assert.equal(result.authenticated, true);
  assert.equal(result.productId, mitraPreviewProductId);
  assert.equal(result.agentId, mitraPreviewAgentId);
  assert.equal(result.workspaceId, "workspace.preview.igor.mitra");
  assert.equal(result.accessGrantId, "grant.preview.igor.mitra");
  assert.match(result.setCookie, /^__Host-apidevelopers-session=/);
  assert.equal(puts.some(([, , value]) => value?.productId === mitraPreviewProductId), true);
});

test("preview bootstrap rejects host and product mismatches before credential verification", async () => {
  let called = false;
  const bootstrap = createUniCoPreviewBrowserSessionBootstrap({
    store: { transaction: async () => {} },
    loginSurfaces: [
      {
        host: mitraPreviewLoginHost,
        productId: mitraPreviewProductId,
        agentId: mitraPreviewAgentId,
      },
    ],
    verifyCredentials: async () => {
      called = true;
      return { name: "Igor" };
    },
    resolveAccess: async () => ({}),
    generateSecret: () => SECRET,
  });

  await assert.rejects(
    () => bootstrap.login({
      host: mitraPreviewLoginHost,
      email: "igor@example.com",
      password: "x",
      productId: "product:uni-co",
    }),
    /preview_login_product_mismatch/,
  );

  await assert.rejects(
    () => bootstrap.login({
      host: "uni-preview.apidevelopers.digital",
      email: "igor@example.com",
      password: "x",
      productId: mitraPreviewProductId,
    }),
    /preview_login_surface_not_allowed/,
  );

  assert.equal(called, false);
});

test("preview login HTTP passes requested Mitra product binding to bootstrap", async () => {
  let loginInput;
  const http = createUniCoPreviewLoginHttpApp({
    app: {
      async handleRequest() {
        return { status: 404, headers: {}, body: "{}" };
      },
    },
    bootstrap: {
      async login(input) {
        loginInput = input;
        return {
          authenticated: true,
          productId: mitraPreviewProductId,
          agentId: mitraPreviewAgentId,
          workspaceId: "workspace.preview.igor.mitra",
          accessGrantId: "grant.preview.igor.mitra",
          expiresAt: "2026-09-15T00:15:00.000Z",
          setCookie: "__Host-apidevelopers-session=test; Path=/; HttpOnly; Secure; SameSite=Lax",
        };
      },
    },
  });

  const response = await http.app.handleRequest({
    method: "POST",
    url: "/v1/web-agent/session/login",
    headers: {
      "x-apidevelopers-surface-host": mitraPreviewLoginHost,
    },
    body: JSON.stringify({
      email: "igor@example.com",
      password: "Mitra#123",
      productId: mitraPreviewProductId,
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(loginInput, {
    host: mitraPreviewLoginHost,
    email: "igor@example.com",
    password: "Mitra#123",
    productId: mitraPreviewProductId,
  });
  assert.equal(JSON.parse(response.body).productId, mitraPreviewProductId);
});

test("SaaS access resolver allows Mitra only when configured explicitly", async () => {
  const calls = [];
  const resolveAccess = createUniCoPreviewSaasAccessResolver({
    allowedProductIds: [mitraPreviewProductId],
    accessRuntime: {
      async resolveActiveGrant(input) {
        calls.push(input);
        return {
          resolved: true,
          grant: {
            workspaceId: "workspace.preview.igor.mitra",
            accessGrantId: "grant.preview.igor.mitra",
            requiredScopes: ["web:chat"],
          },
        };
      },
    },
  });

  const result = await resolveAccess({
    identity: { principalId: "principal.preview.igor", tenantId: "tenant.preview.igor" },
    productId: mitraPreviewProductId,
    requiredScopes: ["web:chat"],
  });

  assert.deepEqual(calls, [{
    tenantId: "tenant.preview.igor",
    principalId: "principal.preview.igor",
    productId: mitraPreviewProductId,
  }]);
  assert.equal(result.workspaceId, "workspace.preview.igor.mitra");
  assert.equal(result.accessGrantId, "grant.preview.igor.mitra");
});
