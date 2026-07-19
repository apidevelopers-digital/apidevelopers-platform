import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.mjs";
import { createClientStore } from "../src/client-store.mjs";

function parse(result) {
  return JSON.parse(result.body);
}

function fixture() {
  const clientStore = createClientStore({
    clock: () => "2026-07-19T12:00:00.000Z",
    idFactory: () => "client-test-001",
  });

  return {
    clientStore,
    app: createApp({
      clientStore,
      adminKey: "admin-test-key",
      requestIdFactory: () => "request-test-001",
    }),
  };
}

test("serves health, catalog and OpenAPI publicly", async () => {
  const { app } = fixture();

  const health = await app.handleRequest({ url: "/health" });
  const catalog = await app.handleRequest({ url: "/v1/apis" });
  const openapi = await app.handleRequest({ url: "/openapi.json" });

  assert.equal(health.status, 200);
  assert.equal(parse(health).status, "ok");
  assert.equal(catalog.status, 200);
  assert.ok(parse(catalog).meta.count >= 1);
  assert.equal(openapi.status, 200);
  assert.equal(parse(openapi).openapi, "3.1.0");
});

test("rejects protected routes without an API Key", async () => {
  const { app } = fixture();
  const result = await app.handleRequest({ url: "/v1/me" });

  assert.equal(result.status, 401);
  assert.equal(parse(result).error, "unauthorized");
});

test("admin creates a client and the issued API Key authenticates it", async () => {
  const { app } = fixture();

  const created = await app.handleRequest({
    method: "POST",
    url: "/v1/admin/clients",
    headers: { "x-api-key": "admin-test-key" },
    body: {
      name: "Example Client",
      contactEmail: "dev@example.test",
      scopes: ["api:read", "catalog:read"],
    },
  });

  assert.equal(created.status, 201);
  const createdBody = parse(created);
  assert.equal(createdBody.data.id, "client-test-001");
  assert.match(createdBody.credentials.apiKey, /^apid_/);

  const authenticated = await app.handleRequest({
    url: "/v1/me",
    headers: { authorization: `ApiKey ${createdBody.credentials.apiKey}` },
  });

  assert.equal(authenticated.status, 200);
  assert.equal(parse(authenticated).data.client.name, "Example Client");
});

test("client API Key cannot access administrative routes", async () => {
  const { app, clientStore } = fixture();
  const { apiKey } = clientStore.createClient({
    name: "Read Only",
    contactEmail: "readonly@example.test",
  });

  const result = await app.handleRequest({
    url: "/v1/admin/clients",
    headers: { "x-api-key": apiKey },
  });

  assert.equal(result.status, 403);
  assert.equal(parse(result).error, "forbidden");
});

test("invalid client payload returns a controlled error", async () => {
  const { app } = fixture();

  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/admin/clients",
    headers: { "x-api-key": "admin-test-key" },
    body: { name: "" },
  });

  assert.equal(result.status, 400);
  assert.equal(parse(result).error, "invalid_client");
});
