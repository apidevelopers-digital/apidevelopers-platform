import assert from "node:assert/strict";
import test from "node:test";

import { createJuridimetriaJurisprudenceProvider } from "../src/mitra-jurisprudence-juridimetria-provider.mjs";

test("Juridimetria provider is disabled by default and performs no external call", async () => {
  let calls = 0;
  const provider = createJuridimetriaJurisprudenceProvider({
    fetchFn: async () => {
      calls += 1;
      return { ok: true, status: 200, async json() { return { results: [] }; } };
    },
  });

  assert.equal(provider.enabled, false);
  await assert.rejects(() => provider.search({ q: "tema", limit: 5 }), /juridimetria_provider_disabled/);
  assert.equal(calls, 0);
});

test("Juridimetria provider requires explicit https allowlisted configuration when enabled", () => {
  assert.throws(
    () => createJuridimetriaJurisprudenceProvider({ enabled: true, baseUrl: "http://juridimetria.test", apiKey: "secret", allowedHosts: ["juridimetria.test"], fetchFn: async () => ({}) }),
    /https/,
  );

  assert.throws(
    () => createJuridimetriaJurisprudenceProvider({ enabled: true, baseUrl: "https://evil.test", apiKey: "secret", allowedHosts: ["juridimetria.test"], fetchFn: async () => ({}) }),
    /not allowed/,
  );

  assert.throws(
    () => createJuridimetriaJurisprudenceProvider({ enabled: true, baseUrl: "https://juridimetria.test", allowedHosts: ["juridimetria.test"], fetchFn: async () => ({}) }),
    /apiKey/,
  );
});

test("Juridimetria provider performs read-only GET and normalizes safe public output", async () => {
  const calls = [];
  const provider = createJuridimetriaJurisprudenceProvider({
    enabled: true,
    baseUrl: "https://juridimetria.test/api",
    apiKey: "super-secret-token",
    allowedHosts: ["juridimetria.test"],
    timeoutMs: 1000,
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
                password: "must-not-leak",
              },
            ],
          };
        },
      };
    },
  });

  const output = await provider.search({
    q: "direito civil",
    tribunal: "STJ",
    periodFrom: "2026-01-01",
    periodTo: "206-02-01",
    limit: 1,
  });

  assert.equal(provider.enabled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].url.includes("q=direito+civil"), true);
  assert.equal(calls[0].url.includes("tribunal=STJ"), true);
  assert.equal(calls[0].url.includes("limit=1"), true);
  assert.equal(calls[0].init.headers.authorization, "Bearer super-secret-token");

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
  assert.equal(serialized.includes("password"), false);
});

test("Juridimetria provider returns safe HTTP errors without leaking credentials", async () => {
  const provider = createJuridimetriaJurisprudenceProvider({
    enabled: true,
    baseUrl: "https://juridimetria.test",
    apiKey: "super-secret-token",
    allowedHosts: ["juridimetria.test"],
    fetchFn: async () => ({ ok: false, status: 503, async json() { return {}; } }),
  });

  await assert.rejects(() => provider.search({ q: "tema", limit: 5 }), /juridimetria_http_503/);
});
