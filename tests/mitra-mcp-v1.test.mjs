import test from "node:test";
import assert from "node:assert/strict";

import { createMitraMcpV1Server, mitraMcpV1Contract } from "../apps/api-gateway/src/mitra-mcp-v1.mjs";

async function rpc(server, body) {
  const response = await server.handleRequest({ method: "POST", url: "/mcp", body: JSON.stringify(body) });
  return { ...response, json: JSON.parse(response.body) };
}

test("lists Mitra MCP v1 tools", async () => {
  const server = createMitraMcpV1Server();
  const response = await rpc(server, { jsonrpc: "2.0", id: 1, method: "tools/list" });

  assert.equal(response.status, 200);
  assert.equal(response.json.result.tools.some((tool) => tool.name === "mitra.buscar_jurisprudencia"), true);
});

test("denies calls without authentication", async () => {
  const server = createMitraMcpV1Server();
  const response = await rpc(server, {
    jsonrpc: "2.0",
    id: "a",
    method: "tools/call",
    params: { name: "mitra.status", arguments: {} },
  });

  assert.equal(response.json.error.message, "unauthorized");
});

test("denies calls without required scope", async () => {
  const server = createMitraMcpV1Server({
    async authenticate() {
      return { principal: { tenantId: "t1", scopes: ["mitra:status:read"] } };
    },
  });
  const response = await rpc(server, {
    jsonrpc: "2.0",
    id: "b",
    method: "tools/call",
    params: { name: "mitra.buscar_jurisprudencia", arguments: { query: "dano moral" } },
  });

  assert.equal(response.json.error.message, "insufficient_scope");
  assert.equal(response.json.error.data.requiredScope, "mitra:jurisprudencia:read");
});

test("calls Lex client for jurisprudence search", async () => {
  const calls = [];
  const server = createMitraMcpV1Server({
    async authenticate() {
      return { principal: { tenantId: "t1", scopes: ["mitra:jurisprudencia:read"] } };
    },
    lexClient: {
      async buscarJurisprudencia(args, context) {
        calls.push({ args, context });
        return { ok: true, results: [{ title: "Julgado teste" }], source: "lex-legal-api" };
      },
    },
  });
  const response = await rpc(server, {
    jsonrpc: "2.0",
    id: "c",
    method: "tools/call",
    params: { name: "mitra.buscar_jurisprudencia", arguments: { query: "negativação indevida", limit: 2 } },
  });

  assert.equal(response.json.result.structuredContent.ok, true);
  assert.equal(response.json.result.structuredContent.source, "lex-legal-api");
  assert.equal(calls[0].args.limit, 2);
  assert.equal(calls[0].context.tenantId, "t1");
});

test("exposes contract metadata", () => {
  assert.equal(mitraMcpV1Contract.name, "mitra-mcp-v1");
  assert.equal(mitraMcpV1Contract.tools.every((tool) => tool.name.startsWith("mitra.")), true);
});
