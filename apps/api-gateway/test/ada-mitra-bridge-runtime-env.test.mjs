import assert from "node:assert/strict";
import test from "node:test";

import { createAdaMitraBridgeReadOnlyFromRuntimeEnv } from "../src/ada-mitra-bridge-runtime-env.mjs";

const LEXML_XML = `<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/" xmlns:dc="http://purl.org/dc/elements/1.1/"><srw:record><srw:recordData><dc:title> Jurisprudência pública </dc:title><dc:identifier>https://www.lexml.gov.br/urn/1</dc:identifier><dc:source>STJ</dc:source><dc:date>2026-01-01</dc:date><dc:description> decisão pública </dc:description></srw:recordData></srw:record></srw:searchRetrieveResponse>`;

function identity(scopes = ["ada:mitra:read"]) {
  return Object.freeze({ role: "service", principal: Object.freeze({ id: "component.principal.ada", tenantId: "tenant:institution", scopes: Object.freeze(scopes), status: "active" }) });
}

function authenticator(value = identity()) {
  return Object.freeze({ async authenticate() { return value; } });
}

test("ADA Mitra runtime env bridge keeps public providers disabled by default", async () => {
  let calls = 0;
  const bridge = createAdaMitraBridgeReadOnlyFromRuntimeEnv({
    authenticator: authenticator(),
    env: {},
    fetchFn: async () => { calls += 1; return {}; },
  });

  const response = await bridge.handleRequest({ method: "GET", url: "/v1/ada/mitra/legal/jurisprudencia?q=tema" });

  assert.equal(response.status, 503);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.equal(body.error, "dependency_unavailable");
  assert.equal(body.reason, "jurisprudence_source_not_connected");
  assert.equal(body.writeExecuted, false);
  assert.equal(calls, 0);
});

test("ADA Mitra runtime env bridge uses enabled LexML and DataJud public providers", async () => {
  const calls = [];
  const bridge = createAdaMitraBridgeReadOnlyFromRuntimeEnv({
    authenticator: authenticator(),
    env: {
      MITRA_LEXML_PROVIDER_ENABLED: "true",
      MITRA_LEXML_SRU_URL: "https://www.lexml.gov.br/busca/SRU",
      MITRA_LEXML_ALLOWED_HOSTS: "www.lexml.gov.br",
      MITRA_DATAJUD_PROVIDER_ENABLED: "true",
      MITRA_DATAJUD_BASE_URL: "https://api-publica.datajud.cnj.jus.br",
      MITRA_DATAJUD_ALLOWED_HOSTS: "api-publica.datajud.cnj.jus.br",
      MITRA_DATAJUD_API_KEY: "public-api-key",
    },
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("lexml")) return { ok: true, status: 200, async text() { return LEXML_XML; } };
      return {
        ok: true,
        status: 200,
        async json() {
          return { hits: { hits: [{ _source: { numeroProcesso: "0000001-00.2026.3.00.0000", tribunal: "STJ", classe: { nome: "Recurso Especial" }, dataAjuizamento: "2026-01-02T00:00:00.000Z", access_token: "must-not-leak" } }] } };
        },
      };
    },
  });

  const response = await bridge.handleRequest({ method: "GET", url: "/v1/ada/mitra/legal/jurisprudencia?q=tema&tribunal=STJ&limit=5" });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].init.method, "POST");
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.executionStatus, "read_only_provider_result");
  assert.equal(body.writeExecuted, false);
  assert.deepEqual(body.results.map((result) => result.source), ["LexML", "DataJud/CNJ"]);
  const serialized = JSON.stringify(body).toLowerCase();
  assert.equal(serialized.includes("public-api-key"), false);
  assert.equal(serialized.includes("access_token"), false);
  assert.equal(serialized.includes("must-not-leak"), false);
});
