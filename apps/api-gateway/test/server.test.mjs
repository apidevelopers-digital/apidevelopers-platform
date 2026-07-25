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

test("unknown route returns 404", async () => {
  const app = createApp();
  const response = await app.handleRequest({ method: "GET", url: "/missing" });

  assert.equal(response.status, 404);
  assert.deepEqual(JSON.parse(response.body), {
    error: "not_found",
  });
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
