import test from "node:test";
import assert from "node:assert/strict";

import { createMitraPublicJurisprudenciaFacade } from "../src/mitra-public-jurisprudencia-facade.mjs";

test("Mitra public jurisprudencia facade forwards server-side credentials and strips unsafe fields", async () => {
  const calls = [];
  const facade = createMitraPublicJurisprudenciaFacade({
    env: {
      ADA_MITRA_MCP_V1_READ_TOKEN: "saved-read-token",
      ADA_MITRA_BRIDGE_TENANT_ID: "tenant:institution",
    },
    adaMitraBridge: {
      async handleRequest(request) {
        calls.push(request);
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ok: true,
            adapterId: "mitra.buscar_jurisprudencia",
            executionStatus: "read_only_provider_result",
            writeExecuted: false,
            rawSqlAllowed: false,
            writeAllowed: false,
            results: [
              {
                id: "ac-1",
                title: "Tema público",
                source: "LexML",
                url: "https://example.test/ac-1",
                court: "STJ",
                date: "2026-01-01",
                summary: "decisão pública",
                access_token: "must-not-leak",
                api_key: "must-not-leak",
              },
            ],
          }),
        };
      },
    },
  });

  const response = await facade.handleRequest({
    method: "GET",
    url: "/v1/mitra/public/jurisprudencia?q=direito%20civil&tribunal=STJ&limit=99&periodFrom=2026-01-01&periodTo=bad",
    headers: { authorization: "Bearer browser-token", cookie: "private=value" },
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "/v1/ada/mitra/legal/jurisprudencia?q=direito+civil&tribunal=STJ&periodFrom=2026-01-01&limit=20",
  );
  assert.equal(calls[0].headers["x-api-key"], "saved-read-token");
  assert.equal(calls[0].headers["x-tenant-id"], "tenant:institution");
  assert.equal(calls[0].headers["x-public-facade"], "mitra-public-jurisprudencia");
  assert.equal(calls[0].headers.accept, "application/json");
  assert.equal(calls[0].headers.authorization, undefined);
  assert.equal(calls[0].headers.cookie, undefined);

  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.adapterId, "mitra.buscar_jurisprudencia");
  assert.equal(body.source, "Mitra Jurisprudência Pública");
  assert.deepEqual(body.results, [
    {
      id: "ac-1",
      title: "Tema público",
      source: "LexML",
      url: "https://example.test/ac-1",
      court: "STJ",
      date: "2026-01-01",
      summary: "decisão pública",
    },
  ]);

  const serialized = JSON.stringify(body).toLowerCase();
  assert.equal(serialized.includes("must-not-leak"), false);
  assert.equal(serialized.includes("access_token"), false);
  assert.equal(serialized.includes("api_key"), false);
});

test("Mitra public jurisprudencia facade ignores other routes and rejects unsafe requests", async () => {
  const bridge = {
    async handleRequest() {
      throw new Error("should not call bridge");
    },
  };
  const facade = createMitraPublicJurisprudenciaFacade({
    env: {
      ADA_MITRA_MCP_V1_READ_TOKEN: "saved-read-token",
      ADA_MITRA_BRIDGE_TENANT_ID: "tenant:institution",
    },
    adaMitraBridge: bridge,
  });

  assert.equal(await facade.handleRequest({ method: "GET", url: "/ready" }), null);

  const method = await facade.handleRequest({ method: "POST", url: "/v1/mitra/public/jurisprudencia?q=tema" });
  assert.equal(method.status, 405);

  const missingQuery = await facade.handleRequest({ method: "GET", url: "/v1/mitra/public/jurisprudencia" });
  assert.equal(missingQuery.status, 400);
  assert.equal(JSON.parse(missingQuery.body).error, "query_required");
});

test("Mitra public jurisprudencia facade fails closed when server credentials are absent", async () => {
  let calls = 0;
  const facade = createMitraPublicJurisprudenciaFacade({
    env: {},
    adaMitraBridge: {
      async handleRequest() {
        calls += 1;
        return { status: 200, headers: {}, body: "{}" };
      },
    },
  });

  const response = await facade.handleRequest({
    method: "GET",
    url: "/v1/mitra/public/jurisprudencia?q=tema",
  });

  assert.equal(response.status, 503);
  assert.equal(JSON.parse(response.body).error, "public_jurisprudencia_credentials_unavailable");
  assert.equal(calls, 0);
});
