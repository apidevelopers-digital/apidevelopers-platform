import assert from "node:assert/strict";
import test from "node:test";

import { createUniCoPreviewBackendIdentityVerifier } from "../src/web-agent-preview-backend-identity.mjs";
import {
  createUniCoPreviewBrowserSessionBootstrap,
  mitraPreviewLoginHost,
  mitraPreviewProductId,
  mitraPreviewAgentId,
} from "../src/web-agent-preview-session-bootstrap.mjs";

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test("backend identity verifier resolves Mitra access through Mitra product endpoint", async () => {
  const calls = [];
  const verifier = createUniCoPreviewBackendIdentityVerifier({
    baseUrl: "https://unico.sitedauni.com",
    fetchImpl: async (url, options) => {
      calls.push({
        url: String(url),
        method: options.method,
        headers: { ...options.headers },
        body: options.body ?? null,
      });
      if (String(url).endsWith("/operator/v1/session/login")) {
        return response(200, {
          ok: true,
          sessionToken: "temporary-operator-token",
          operator: { email: "igor@sitedauni.com" },
        });
      }
      if (String(url).endsWith("/operator/v1/mitra/preview/saas/access")) {
        return response(200, {
          ok: true,
          allowed: true,
          principalId: "principal.preview.igor",
          binding: {
            tenantId: "tenant.preview.igor",
            workspaceId: "workspace.preview.igor.mitra",
            accessGrantId: "grant.preview.igor.mitra",
            productId: "product:mitra",
          },
        });
      }
      if (String(url).endsWith("/operator/v1/session/logout")) {
        return response(200, { ok: true });
      }
      throw new Error(`unexpected request ${url}`);
    },
  });

  const identity = await verifier({
    email: " Igor@SiteDaUni.com ",
    password: "not-logged",
    productId: "product:mitra",
  });

  assert.equal(identity.email, "igor@sitedauni.com");
  assert.equal(identity.expectedBinding.productId, "product:mitra");
  assert.equal(identity.expectedBinding.workspaceId, "workspace.preview.igor.mitra");
  assert.equal(calls[1].url.endsWith("/operator/v1/mitra/preview/saas/access"), true);
  assert.equal(calls[1].headers.authorization, "Bearer temporary-operator-token");
  assert.equal(JSON.stringify(identity).includes("temporary-operator-token"), false);
  assert.equal(JSON.stringify(identity).includes("not-logged"), false);
});

test("browser session bootstrap passes selected Mitra product into identity verifier", async () => {
  let verifierInput;
  const puts = [];
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
    loginSurfaces: [
      {
        host: mitraPreviewLoginHost,
        productId: mitraPreviewProductId,
        agentId: mitraPreviewAgentId,
      },
    ],
    clock: () => new Date("2026-09-15T02:00:00.000Z"),
    generateSecret: () => "C".repeat(43),
    verifyCredentials: async (input) => {
      verifierInput = input;
      return {
        principalId: "principal.preview.igor",
        tenantId: "tenant.preview.igor",
        name: "Igor",
        email: "igor@sitedauni.com",
        expectedBinding: {
          workspaceId: "workspace.preview.igor.mitra",
          accessGrantId: "grant.preview.igor.mitra",
          productId: mitraPreviewProductId,
        },
      };
    },
    resolveAccess: async ({ identity, productId }) => {
      assert.equal(identity.expectedBinding.productId, mitraPreviewProductId);
      assert.equal(productId, mitraPreviewProductId);
      return {
        principalId: "principal.preview.igor",
        tenantId: "tenant.preview.igor",
        workspaceId: "workspace.preview.igor.mitra",
        accessGrantId: "grant.preview.igor.mitra",
      };
    },
  });

  const session = await bootstrap.login({
    host: mitraPreviewLoginHost,
    email: "igor@sitedauni.com",
    password: "not-logged",
    productId: mitraPreviewProductId,
  });

  assert.deepEqual(verifierInput, {
    email: "igor@sitedauni.com",
    password: "not-logged",
    productId: mitraPreviewProductId,
  });
  assert.equal(session.authenticated, true);
  assert.equal(session.productId, mitraPreviewProductId);
  assert.equal(session.agentId, mitraPreviewAgentId);
  assert.equal(puts.some(([, , value]) => value?.productId === mitraPreviewProductId), true);
});
