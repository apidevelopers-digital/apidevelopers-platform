import assert from "node:assert/strict";
import test from "node:test";

import {
  createJuridimetriaJurisprudenceProviderFromEnv,
  getJuridimetriaJurisprudenceProviderConfigStatus,
} from "../src/mitra-jurisprudence-juridimetria-provider-config.mjs";

test("Juridimetria provider config is disabled by default without external calls", async () => {
  let calls = 0;
  const provider = createJuridimetriaJurisprudenceProviderFromEnv({
    env: {},
    fetchFn: async () => {
      calls += 1;
      return { ok: true, status: 200, async json() { return { results: [] }; } };
    },
  });

  assert.equal(provider.enabled, false);
  await assert.rejects(() => provider.search({ q: "tema", limit: 5 }), /juridimetria_provider_disabled/);
  assert.equal(calls, 0);

  assert.deepEqual(getJuridimetriaJurisprudenceProviderConfigStatus({}), {
    providerId: "juridimetria",
    enabled: false,
    baseUrlPresent: false,
    apiKeyPresent: false,
    allowedHostCount: 0,
    timeoutMsPresent: false,
  });
});

test("Juridimetria provider config exposes only presence/status metadata", () => {
  const status = getJuridimetriaJurisprudenceProviderConfigStatus({
    MITRA_JURIDIMETRIA_PROVIDER_ENABLED: "true",
    MITRA_JURIDIMETRIA_BASE_URL: "https://juridimetria.test/api",
    MITRA_JURIDIMETRIA_API_KEY: "super-secret-token",
    MITRA_JURIDIMETRIA_ALLOWED_HOSTS: "juridimetria.test, api.juridimetria.test",
    MITRA_JURIDIMETRIA_TIMEOUT_MS: "1200",
  });

  assert.deepEqual(status, {
    providerId: "juridimetria",
    enabled: true,
    baseUrlPresent: true,
    apiKeyPresent: true,
    allowedHostCount: 2,
    timeoutMsPresent: true,
  });
  assert.equal(JSON.stringify(status).includes("super-secret-token"), false);
  assert.equal(JSON.stringify(status).includes("https://juridimetria.test"), false);
});

test("Juridimetria provider config validates enabled HTTPS allowlisted configuration", () => {
  assert.throws(
    () => createJuridimetriaJurisprudenceProviderFromEnv({
      env: {
        MITRA_JURIDIMETRIA_PROVIDER_ENABLED: "true",
        MITRA_JURIDIMETRIA_BASE_URL: "http://juridimetria.test",
        MITRA_JURIDIMETRIA_API_KEY: "secret",
        MITRA_JURIDIMETRIA_ALLOWED_HOSTS: "juridimetria.test",
      },
      fetchFn: async () => ({}),
    }),
    /https/,
  );

  assert.throws(
    () => createJuridimetriaJurisprudenceProviderFromEnv({
      env: {
        MITRA_JURIDIMETRIA_PROVIDER_ENABLED: "true",
        MITRA_JURIDIMETRIA_BASE_URL: "https://evil.test",
        MITRA_JURIDIMETRIA_API_KEY: "secret",
        MITRA_JURIDIMETRIA_ALLOWED_HOSTS: "juridimetria.test",
      },
      fetchFn: async () => ({}),
    }),
    /not allowed/,
  );
});

test("Juridimetria provider config creates enabled provider using explicit safe env and mock fetch", async () => {
  const calls = [];
  const provider = createJuridimetriaJurisprudenceProviderFromEnv({
    env: {
      MITRA_JURIDIMETRIA_PROVIDER_ENABLED: "enabled",
      MITRA_JURIDIMETRIA_BASE_URL: "https://juridimetria.test/api",
      MITRA_JURIDIMETRIA_API_KEY: "super-secret-token",
      MITRA_JURIDIMETRIA_ALLOWED_HOSTS: "juridimetria.test",
      MITRA_JURIDIMETRIA_TIMEOUT_MS: "1200",
    },
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            results: [
              {
                id: " ac-1 ",
                title: " Tema público ",
                source: "Juridimetria",
                url: "https://public.example/ac-1",
                court: " STJ ",
                date: "2026-01-02",
                summary: " decisão pública ",
                access_token: "must-not-leak",
              },
            ],
          };
        },
      };
    },
  });

  assert.equal(provider.enabled, true);
  const output = await provider.search({ q: "direito civil", tribunal: "STJ", limit: 1 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.authorization, "Bearer super-secret-token");
  assert.equal(calls[0].url.includes("q=direito+civil"), true);
  assert.equal(calls[0].url.includes("tribunal=STJ"), true);
  assert.equal(calls[0].url.includes("limit=1"), true);

  assert.deepEqual(output, {
    results: [
      {
        id: "ac-1",
        title: "Tema público",
        source: "Juridimetria",
        url: "https://public.example/ac-1",
        court: "STJ",
        date: "2026-01-02",
        summary: "decisão pública",
      },
    ],
  });

  const serialized = JSON.stringify(output).toLowerCase();
  assert.equal(serialized.includes("super-secret-token"), false);
  assert.equal(serialized.includes("access_token"), false);
});
