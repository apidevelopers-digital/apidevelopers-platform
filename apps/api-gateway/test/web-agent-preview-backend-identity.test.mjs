import assert from "node:assert/strict";
import test from "node:test";

import { createUniCoPreviewBackendIdentityVerifier } from "../src/web-agent-preview-backend-identity.mjs";

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test("backend identity verifier authenticates, resolves delegated uni.co binding and logs out", async () => {
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
          operator: { email: "igor@example.com" },
        });
      }
      if (String(url).endsWith("/operator/v1/uni-co/preview/saas/access")) {
        return response(200, {
          ok: true,
          allowed: true,
          principalId: "principal.preview.1",
          binding: {
            tenantId: "tenant.preview.1",
            workspaceId: "workspace.preview.1",
            accessGrantId: "grant.preview.1",
            productId: "product:uni-co",
          },
        });
      }
      if (String(url).endsWith("/operator/v1/session/logout")) {
        return response(200, { ok: true });
      }
      throw new Error("unexpected request");
    },
  });

  const identity = await verifier({
    email: " IGOR@EXAMPLE.COM ",
    password: "Preview#123",
  });

  assert.deepEqual(identity, {
    principalId: "principal.preview.1",
    tenantId: "tenant.preview.1",
    name: "igor@example.com",
    email: "igor@example.com",
    expectedBinding: {
      workspaceId: "workspace.preview.1",
      accessGrantId: "grant.preview.1",
      productId: "product:uni-co",
    },
  });

  assert.equal(calls.length, 3);
  assert.equal(JSON.parse(calls[0].body).email, "igor@example.com");
  assert.equal(JSON.parse(calls[0].body).password, "Preview#123");
  assert.equal(calls[1].headers.authorization, "Bearer temporary-operator-token");
  assert.equal(calls[2].headers.authorization, "Bearer temporary-operator-token");
  assert.equal(JSON.stringify(identity).includes("temporary-operator-token"), false);
  assert.equal(JSON.stringify(identity).includes("Preview#123"), false);
});

test("backend identity verifier maps invalid credentials without attempting delegated access", async () => {
  const calls = [];
  const verifier = createUniCoPreviewBackendIdentityVerifier({
    baseUrl: "https://unico.sitedauni.com",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), method: options.method });
      return response(401, { ok: false, error: "invalid_credentials" });
    },
  });

  await assert.rejects(
    () => verifier({ email: "x@example.com", password: "wrong" }),
    /invalid_credentials/,
  );
  assert.equal(calls.length, 1);
});

test("backend identity verifier logs out even when delegated SaaS access is denied", async () => {
  const calls = [];
  const verifier = createUniCoPreviewBackendIdentityVerifier({
    baseUrl: "https://unico.sitedauni.com",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), method: options.method });
      if (String(url).endsWith("/operator/v1/session/login")) {
        return response(200, {
          ok: true,
          sessionToken: "temporary-operator-token",
          operator: { email: "igor@example.com" },
        });
      }
      if (String(url).endsWith("/operator/v1/uni-co/preview/saas/access")) {
        return response(403, {
          ok: false,
          allowed: false,
          error: "access_grant_not_found",
        });
      }
      if (String(url).endsWith("/operator/v1/session/logout")) {
        return response(200, { ok: true });
      }
      throw new Error("unexpected request");
    },
  });

  await assert.rejects(
    () => verifier({ email: "igor@example.com", password: "Preview#123" }),
    /access_grant_not_found/,
  );
  assert.equal(calls.length, 3);
  assert.equal(calls[2].url.endsWith("/operator/v1/session/logout"), true);
});

test("backend identity verifier rejects insecure upstream URLs", () => {
  assert.throws(
    () => createUniCoPreviewBackendIdentityVerifier({ baseUrl: "http://unico.local" }),
    /preview_identity_backend_https_required/,
  );
});
