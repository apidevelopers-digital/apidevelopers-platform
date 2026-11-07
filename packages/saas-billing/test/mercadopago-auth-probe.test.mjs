import assert from "node:assert/strict";
import test from "node:test";

import {
  createReadOnlyFetch,
  runMercadoPagoAuthProbe,
} from "../../../scripts/mercadopago-auth-probe.mjs";

test("read-only fetch blocks mutation methods before network", async () => {
  let called = false;
  const safeFetch = createReadOnlyFetch(async () => {
    called = true;
    throw new Error("should not be called");
  });

  await assert.rejects(
    () => safeFetch("https://api.mercadolibre.com/users/me", { method: "POST" }),
    (error) => error?.code === "non_read_only_method_blocked",
  );
  assert.equal(called, false);
});

test("probe refuses live mode before network", async () => {
  let called = false;

  await assert.rejects(
    () =>
      runMercadoPagoAuthProbe({
        accessToken: "test-placeholder-token",
        expectedTestUserId: "123",
        billingMode: "live",
        fetchImpl: async () => {
          called = true;
          throw new Error("should not be called");
        },
      }),
    (error) => error?.code === "test_mode_required",
  );

  assert.equal(called, false);
});

test("probe refuses explicit live enablement before network", async () => {
  let called = false;

  await assert.rejects(
    () =>
      runMercadoPagoAuthProbe({
        accessToken: "test-placeholder-token",
        expectedTestUserId: "123",
        billingMode: "test",
        liveEnabled: "true",
        fetchImpl: async () => {
          called = true;
          throw new Error("should not be called");
        },
      }),
    (error) => error?.code === "live_enablement_blocked",
  );

  assert.equal(called, false);
});

test("probe validates credential read-only against the expected test account", async () => {
  const seen = [];

  const result = await runMercadoPagoAuthProbe({
    accessToken: "test-placeholder-token",
    expectedTestUserId: "123",
    billingMode: "test",
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ id: 123, nickname: "not-returned-by-probe" });
        },
      };
    },
  });

  assert.deepEqual(result, {
    ok: true,
    mode: "read-only",
    billingMode: "test",
    writesEnabled: false,
    credentialValidated: true,
    expectedTestAccountMatched: true,
    endpoint: "/users/me",
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://api.mercadolibre.com/users/me");
  assert.equal(seen[0].init.method, "GET");
  assert.equal(seen[0].init.headers.authorization, "Bearer test-placeholder-token");
  assert.equal(JSON.stringify(result).includes("test-placeholder-token"), false);
  assert.equal(JSON.stringify(result).includes("123"), false);
});

test("probe fails closed when credential belongs to another account", async () => {
  await assert.rejects(
    () =>
      runMercadoPagoAuthProbe({
        accessToken: "test-placeholder-token",
        expectedTestUserId: "123",
        billingMode: "test",
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({ id: 999 });
          },
        }),
      }),
    (error) => error?.code === "unexpected_mercadopago_account",
  );
});
