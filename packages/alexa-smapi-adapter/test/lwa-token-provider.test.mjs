import test from "node:test";
import assert from "node:assert/strict";
import { createLwaTokenProvider } from "../src/lwa-token-provider.mjs";

const creds = () => ({ clientId: "client", clientSecret: "secret", refreshToken: "refresh" });

function setup({ status = 200, payload = { access_token: "access", expires_in: 3600 }, clock = { t: 0 } } = {}) {
  const calls = [];
  const saved = [];
  const provider = createLwaTokenProvider({
    getCredentials: async () => creds(),
    saveRefreshToken: async (token) => { saved.push(token); },
    fetchImpl: async (url, opts) => {
      calls.push({ url, opts });
      return { ok: status === 200, status, json: async () => payload };
    },
    now: () => clock.t,
  });
  return { provider, calls, saved, clock };
}

test("refresh uses fixed HTTPS endpoint and POST without disclosing secrets", async () => {
  const { provider, calls } = setup();
  assert.equal(await provider.getAccessToken(), "access");
  assert.equal(calls[0].url, "https://api.amazon.com/auth/o2/token");
  assert.equal(calls[0].opts.method, "POST");
  assert.equal(calls[0].opts.redirect, "error");
  const fields = new URLSearchParams(calls[0].opts.body);
  assert.equal(fields.get("grant_type"), "refresh_token");
  assert.equal(fields.get("client_id"), "client");
  assert.equal(fields.get("refresh_token"), "refresh");
});
test("caches token and refreshes ahead of expiration", async () => {
  const { provider, calls, clock } = setup();
  await provider.getAccessToken();
  clock.t = 1000;
  await provider.getAccessToken();
  assert.equal(calls.length, 1);
  clock.t = 3550000;
  await provider.getAccessToken();
  assert.equal(calls.length, 2);
});
test("coalesces simultaneous refresh requests", async () => {
  const { provider, calls } = setup();
  const values = await Promise.all([provider.getAccessToken(), provider.getAccessToken()]);
  assert.deepEqual(values, ["access", "access"]);
  assert.equal(calls.length, 1);
});
test("persists rotated refresh token before using access token", async () => {
  const { provider, saved } = setup({ payload: { access_token: "access", refresh_token: "rotated", expires_in: 3600 } });
  assert.equal(await provider.getAccessToken(), "access");
  assert.deepEqual(saved, ["rotated"]);
});
test("fails closed when rotation cannot be saved", async () => {
  const provider = createLwaTokenProvider({
    getCredentials: async () => creds(),
    saveRefreshToken: async () => { throw new Error("sensitive"); },
    fetchImpl: async () => ({ ok: true, json: async () => ({ access_token: "access", refresh_token: "rotated", expires_in: 3600 }) }),
  });
  await assert.rejects(provider.getAccessToken(), /^Error: lwa_secret_storage_failed$/);
});
test("sanitizes LWA errors and rejects malformed responses", async () => {
  await assert.rejects(setup({ status: 401, payload: { error: "credentials" } }).provider.getAccessToken(), /^Error: lwa_http_401$/);
  await assert.rejects(setup({ payload: { access_token: "short", expires_in: 30 } }).provider.getAccessToken(), /^Error: lwa_invalid_response$/);
});
test("refuses to run without secret storage", () => {
  assert.throws(() => createLwaTokenProvider({ getCredentials: async () => creds() }), /secret storage callbacks/);
});
