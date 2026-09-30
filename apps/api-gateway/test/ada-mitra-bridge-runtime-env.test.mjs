import assert from "node:assert/strict";
import test from "node:test";

import { createAdaMitraBridgeReadOnlyFromRuntimeEnv } from "../src/ada-mitra-bridge-runtime-env.mjs";

function identity(scopes = ["ada:mitra:read"]) {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "component.principal.ada",
      tenantId: "tenant:institution",
      scopes: Object.freeze(scopes),
      status: "active",
    }),
  });
}

function authenticator(value = identity()) {
  return Object.freeze({
    async authenticate() {
      return value;
    },
  });
}

test("ADA Mitra runtime env bridge keeps Juridimetria provider disabled by default", async () => {
  let calls = 0;
  const bridge = createAdaMitraBridgeReadOnlyFromRuntimeEnv({
    authenticator: authenticator(),
    env: {},
    fetchFn: async () => {
      calls += 1;
      return { ok: true, status: 200, async json() { return { results: [] }; } };
    },
  });

  const response = await bridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/legal/jurisprudencia?q=tema",
  });

  assert.equal(response.status, 503);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.equal(body.error, "dependency_unavailable");
  assert.equal(body.reason, "jurisprudence_source_not_connected");
  assert.equal(body.writeExecuted, false);
  assert.equal(calls, 0);
});

test("ADA Mitra runtime env bridge uses enabled Juridimetria provider with mock fetch only", async () => {
  const calls = [];
  const bridge = createAdaMitraBridgeReadOnlyFromRuntimeEnv({
    authenticator: authenticator(),
    env: {
      MITRA_JURIDIMETRIA_PROVIDER_ENABLED: "true",
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
                title: " Jurisprudência pública ",
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

  const response = await bridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/legal/jurisprudencia?q=tema&tribunal=STJ&limit=1",
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.authorization, "Bearer super-secret-token");
  assert.equal(calls[0].url.includes("q=tema"), true);
  assert.equal(calls[0].url.includes("tribunal=STJ"), true);
  assert.equal(calls[0].url.includes("limit=1"), true);

  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.adapterId, "mitra.buscar_jurisprudencia");
  assert.equal(body.executionStatus, "read_only_provider_result");
  assert.equal(body.writeExecuted, false);
  assert.equal(body.rawSqlAllowed, false);
  assert.equal(body.writeAllowed, false);
  assert.deepEqual(body.results, [
    {
      id: "ac-1",
      title: "Jurisprudência pública",
      source: "Juridimetria",
      url: "https://public.example/ac-1",
      court: "STJ",
      date: "2026-01-02",
      summary: "decisão pública",
    },
  ]);

  const serialized = JSON.stringify(body).toLowerCase();
  assert.equal(serialized.includes("super-secret-token"), false);
  assert.equal(serialized.includes("access_token"), false);
});
