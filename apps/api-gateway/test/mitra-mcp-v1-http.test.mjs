import assert from "node:assert/strict";
import test from "node:test";

import { createMitraMcpV1HttpApp } from "../src/mitra-mcp-v1-http.mjs";

const auth = (identity) => Object.freeze({ async authenticate() { return identity; } });
const body = (response) => JSON.parse(response.body);

test("Mitra MCP v1 HTTP adapter exposes status and tenant context", async () => {
  const app = createMitraMcpV1HttpApp({
    authenticator: auth({ principal: { tenantId: "tenant_milena", scopes: ["mitra:status:read"] } }),
    runtime: {
      async executeTool({ name, context, identity }) {
        assert.equal(name, "mitra.status");
        assert.equal(context.tenantId, "tenant_milena");
        assert.deepEqual(identity.principal.scopes, ["mitra:status:read"]);
        return { ok: true, service: "mitra-mcp", tenantId: context.tenantId, timestamp: "2026-09-25T00:00:00.000Z" };
      },
    },
  });

  const response = await app.handleRequest({ method: "GET", url: "/v1/mitra/mcp/status" });

  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(body(response), {
    ok: true,
    service: "mitra-mcp",
    tenantId: "tenant_milena",
    timestamp: "2026-09-25T00:00:00.000Z",
  });
});

test("Mitra MCP v1 HTTP adapter exposes capabilities and honors x-tenant-id", async () => {
  const app = createMitraMcpV1HttpApp({
    authenticator: auth({ principal: { scopes: ["mitra:capabilities:read"] } }),
    runtime: {
      async executeTool({ name, context }) {
        assert.equal(name, "mitra.capabilities");
        assert.equal(context.tenantId, "tenant_header");
        return { ok: true, tenantId: context.tenantId, tools: ["mitra.status"], toolDefinitions: [], limits: {} };
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/mitra/mcp/capabilities",
    headers: { "x-tenant-id": "tenant_header" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(body(response), { ok: true, tenantId: "tenant_header", tools: ["mitra.status"], toolDefinitions: [], limits: {} });
});

test("Mitra MCP v1 HTTP adapter executes tool route with JSON input and maps fail-closed dependency", async () => {
  const app = createMitraMcpV1HttpApp({
    authenticator: auth({ principal: { tenantId: "tenant_milena", scopes: ["mitra:jurisprudencia:read"] } }),
    runtime: {
      async executeTool({ name, input, context }) {
        assert.equal(name, "mitra.buscar_jurisprudencia");
        assert.deepEqual(input, { query: "dano moral negativacao indevida" });
        assert.equal(context.tenantId, "tenant_milena");
        return { ok: false, error: "dependency_unavailable", reason: "adapter_not_wired", retryable: false, needsHumanReview: false };
      },
    },
  });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/mitra/mcp/tools/mitra.buscar_jurisprudencia",
    body: JSON.stringify({ input: { query: "dano moral negativacao indevida" } }),
  });

  assert.equal(response.status, 503);
  assert.equal(body(response).error, "dependency_unavailable");
});

test("Mitra MCP v1 HTTP adapter fails safely on auth, methods, invalid JSON and delegates unknown routes", async () => {
  const unauthenticated = createMitraMcpV1HttpApp({ authenticator: auth(null) });
  assert.equal((await unauthenticated.handleRequest({ method: "GET", url: "/v1/mitra/mcp/status" })).status, 401);

  const authenticated = createMitraMcpV1HttpApp({
    app: { async handleRequest() { return { status: 418, headers: {}, body: "delegated" }; } },
    authenticator: auth({ principal: { tenantId: "tenant_milena", scopes: ["mitra:status:read"] } }),
  });

  assert.equal((await authenticated.handleRequest({ method: "POST", url: "/v1/mitra/mcp/status", body: "{}" })).status, 405);

  const invalid = await authenticated.handleRequest({
    method: "POST",
    url: "/v1/mitra/mcp/tools/mitra.status",
    body: "{not-json",
  });
  assert.equal(invalid.status, 400);
  assert.equal(body(invalid).error, "invalid_json");

  assert.deepEqual(await authenticated.handleRequest({ method: "GET", url: "/health" }), {
    status: 418,
    headers: {},
    body: "delegated",
  });
});
