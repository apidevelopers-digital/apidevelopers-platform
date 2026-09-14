import assert from "node:assert/strict";
import test from "node:test";
import { createMitraAuthClient, MitraAuthClientError } from "../src/auth-client.js";

test("auth client refuses missing base url without fake local session", async () => {
  const client = createMitraAuthClient({ baseUrl: "" });
  await assert.rejects(
    () => client.login({ email: "igor@example.com", password: "secret" }),
    (error) => {
      assert.equal(error instanceof MitraAuthClientError, true);
      assert.equal(error.code, "auth_not_configured");
      assert.equal(error.status, 503);
      return true;
    },
  );
});

test("auth client posts credentials to gateway with Mitra product binding", async () => {
  let captured;
  const client = createMitraAuthClient({
    baseUrl: "https://gateway.apidevelopers.digital",
    surfaceHost: "mitra-preview.apidevelopers.digital",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            authenticated: true,
            productId: "product:mitra",
            workspaceId: "workspace:mitra-preview",
            accessGrantId: "access:mitra-preview",
            expiresAt: "2026-09-14T23:00:00.000Z",
          };
        },
      };
    },
  });

  const session = await client.login({ email: "IGOR@EXAMPLE.COM", password: "secret" });

  assert.equal(session.authenticated, true);
  assert.equal(session.productId, "product:mitra");
  assert.equal(captured.url, "https://gateway.apidevelopers.digital/v1/web-agent/session/login");
  assert.equal(captured.options.credentials, "include");
  assert.equal(captured.options.headers["x-apidevelopers-surface-host"], "mitra-preview.apidevelopers.digital");
  assert.deepEqual(JSON.parse(captured.options.body), {
    email: "igor@example.com",
    password: "secret",
    productId: "product:mitra",
  });
});

test("auth client rejects sessions bound to another product", async () => {
  const client = createMitraAuthClient({
    baseUrl: "https://gateway.apidevelopers.digital",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { ok: true, authenticated: true, productId: "product:uni-co" };
      },
    }),
  });

  await assert.rejects(
    () => client.login({ email: "igor@example.com", password: "secret" }),
    (error) => {
      assert.equal(error.code, "product_binding_mismatch");
      assert.equal(error.status, 403);
      return true;
    },
  );
});
