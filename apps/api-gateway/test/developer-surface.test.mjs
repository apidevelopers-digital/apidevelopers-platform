import assert from "node:assert/strict";
import test from "node:test";

import {
  getGatewayRouteManifest,
  getOpenApiDocument,
} from "../src/openapi.mjs";
import { createApp, startServer } from "../src/server.mjs";

test("OpenAPI document exposes only the current gateway surface", () => {
  const document = getOpenApiDocument();

  assert.equal(document.openapi, "3.1.0");
  assert.deepEqual(Object.keys(document.paths).sort(), [
    "/health",
    "/openapi.json",
    "/ready",
    "/v1/whoami",
  ]);
  assert.equal(
    document.paths["/v1/whoami"].get.security[0].ApiKeyAuth.length,
    0,
  );
  assert.deepEqual(document.paths["/health"].get.security, []);
  assert.deepEqual(document.paths["/ready"].get.security, []);
});

test("route manifest is immutable across callers", () => {
  const first = getGatewayRouteManifest();
  first[0].path = "/changed";

  const second = getGatewayRouteManifest();
  assert.equal(second[0].path, "/health");
});

test("OpenAPI document is immutable across callers", () => {
  const first = getOpenApiDocument();
  first.info.title = "changed";
  first.paths["/health"].get.summary = "changed";

  const second = getOpenApiDocument();
  assert.equal(second.info.title, "API Developers.digital Gateway API");
  assert.equal(second.paths["/health"].get.summary, "Gateway liveness");
});

test("GET /openapi.json returns the machine-readable contract", async () => {
  const app = createApp();
  const response = await app.handleRequest({
    method: "GET",
    url: "/openapi.json",
  });
  const document = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(
    response.headers["content-type"],
    "application/json; charset=utf-8",
  );
  assert.equal(document.openapi, "3.1.0");
  assert.ok(document.paths["/ready"]);
  assert.ok(document.paths["/v1/whoami"]);
});

test("HTTP server exposes the current OpenAPI document", async (t) => {
  const server = await startServer({ port: 0, host: "127.0.0.1" });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(
    `http://127.0.0.1:${address.port}/openapi.json`,
  );
  const document = await response.json();

  assert.equal(response.status, 200);
  assert.equal(document.info.version, "0.7.0");
  assert.ok(document.paths["/ready"]);
});
