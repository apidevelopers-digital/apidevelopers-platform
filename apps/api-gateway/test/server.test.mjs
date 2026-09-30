import assert from "node:assert/strict";
import test from "node:test";

import { createApp, startServer } from "../src/server.mjs";

test("GET /health returns service readiness", async () => {
  const app = createApp();
  const response = await app.handleRequest({ method: "GET", url: "/health" });

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
  assert.deepEqual(JSON.parse(response.body), {
    service: "api-gateway",
    status: "ok",
  });
});

test("GET /health allows only Radar browser origins", async () => {
  const app = createApp();

  for (const origin of [
    "https://radar-preview.apidevelopers.digital",
    "https://radar.apidevelopers.digital",
  ]) {
    const response = await app.handleRequest({
      method: "GET",
      url: "/health",
      headers: { origin },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers["access-control-allow-origin"], origin);
    assert.equal(response.headers.vary, "Origin");
  }

  const rejected = await app.handleRequest({
    method: "GET",
    url: "/health",
    headers: { origin: "https://example.invalid" },
  });

  assert.equal(rejected.status, 200);
  assert.equal(rejected.headers["access-control-allow-origin"], undefined);
  assert.equal(rejected.headers.vary, undefined);
});

test("unknown route returns 404", async () => {
  const app = createApp();
  const response = await app.handleRequest({ method: "GET", url: "/missing" });

  assert.equal(response.status, 404);
  assert.deepEqual(JSON.parse(response.body), {
    error: "not_found",
  });
});

test("default app composes ADA Mitra runtime env with Juridimetria disabled safely", async () => {
  const envKeys = [
    "MITRA_JURIDIMETRIA_PROVIDER_ENABLED",
    "MITRA_JURIDIMETRIA_BASE_URL",
    "MITRA_JURIDIMETRIA_API_KEY",
    "MITRA_JURIDIMETRIA_ALLOWED_HOSTS",
    "MITRA_JURIDIMETRIA_TIMEOUT_MS",
  ];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  try {
    for (const key of envKeys) delete process.env[key];

    const app = createApp({
      authenticator: {
        async authenticate() {
          return {
            role: "service",
            principal: {
              id: "component.principal.ada",
              tenantId: "tenant:institution",
              scopes: ["ada:mitra:read"],
            },
          };
        },
      },
    });

    const response = await app.handleRequest({
      method: "GET",
      url: "/v1/ada/mitra/legal/jurisprudencia?q=tema",
    });

    assert.equal(response.status, 503);
    const body = JSON.parse(response.body);
    assert.equal(body.ok, false);
    assert.equal(body.adapterId, "mitra.buscar_jurisprudencia");
    assert.equal(body.error, "dependency_unavailable");
    assert.equal(body.reason, "jurisprudence_source_not_connected");
    assert.equal(body.writeExecuted, false);
    assert.equal(body.rawSqlAllowed, false);
    assert.equal(body.writeAllowed, false);
  } finally {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("HTTP server exposes the health endpoint", async (t) => {
  const server = await startServer({ port: 0, host: "127.0.0.1" });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    service: "api-gateway",
    status: "ok",
  });
});
