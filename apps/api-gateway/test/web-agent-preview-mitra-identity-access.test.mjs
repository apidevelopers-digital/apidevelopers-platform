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

test("browser bootstrap only sends productId to product-scoped credential verifiers", async () => {
  let legacyInput;
  const legacy = createUniCoPreviewBrowserSessionBootstrap({
    store: { transaction: async () => {} },
    verifyCredentials: async (input) => {
      legacyInput = input;
      return { name: "Igor" };
    },
    resolveAccess: async () => ({
      principalId: "principal.preview.igor",
      tenantId: "tenant.preview.igor",
      workspaceId: "workspace.preview.igor.mitra",
      accessGrantId: "grant.preview.igor.mitra",
    }),
    loginSurfaces: [{ host: mitraPreviewLoginHost, productId: mitraPreviewProductId, agentId: mitraPreviewAgentId }],
    generateSecret: () => "D".repeat(43),
  });

  await legacy.login({
    host: mitraPreviewLoginHost,
    email: "igor@sitedauni.com",
    password: "not-logged",
    productId: mitraPreviewProductId,
  });
  assert.deepEqual(legacyInput, { email: "igor@sitedauni.com", password: "not-logged" });

  let scopedInput;
  const scopedVerifier = async (input) => {
    scopedInput = input;
    return { name: "Igor" };
  };
  scopedVerifier.productScoped = true;

  const scoped = createUniCoPreviewBrowserSessionBootstrap({
    store: { transaction: async () => {} },
    verifyCredentials: scopedVerifier,
    resolveAccess: async () => ({
      principalId: "principal.preview.igor",
      tenantId: "tenant.preview.igor",
      workspaceId: "workspace.preview.igor.mitra",
      accessGrantId: "grant.preview.igor.mitra",
    }),
    loginSurfaces: [{ host: mitraPreviewLoginHost, productId: mitraPreviewProductId, agentId: mitraPreviewAgentId }],
    generateSecret: () => "E".repeat(43),
  });

  await scoped.login({
    host: mitraPreviewLoginHost,
    email: "igor@sitedauni.com",
    password: "not-logged",
    productId: mitraPreviewProductId,
  });
  assert.deepEqual(scopedInput, {
    email: "igor@sitedauni.com",
    password: "not-logged",
    productId: mitraPreviewProductId,
  });
});
