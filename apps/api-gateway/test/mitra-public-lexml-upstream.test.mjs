import test from "node:test";
import assert from "node:assert/strict";

import {
  createMitraPublicLexmlFetchAdapter,
} from "../src/mitra-public-lexml-upstream.mjs";
import {
  createMitraPublicOperationalWrapper,
} from "../src/mitra-public-operational-wrapper.mjs";

const PREVIEW_ORIGIN = "https://preview-apidevelopers.apidevelopers.digital";

const SAMPLE_SRU_XML = `<?xml version="1.0" encoding="UTF-8"?>
<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <srw:numberOfRecords>1</srw:numberOfRecords>
  <srw:records>
    <srw:record>
      <srw:recordSchema>dc</srw:recordSchema>
      <srw:recordData>
        <dc:title>AgInt no AREsp 1518877 / DF</dc:title>
        <dc:date>2020-02-20</dc:date>
        <dc:creator>Superior Tribunal de Justiça. 2ª Turma</dc:creator>
        <dc:type>Acórdão</dc:type>
        <dc:description>Ementa: RESPONSABILIDADE CIVIL DO ESTADO. TRATAMENTO MÉDICO.</dc:description>
        <dc:identifier>urn:lex:br:superior.tribunal.justica;turma.2:acordao;aresp:2020-02-20;1518877-1942873</dc:identifier>
      </srw:recordData>
    </srw:record>
  </srw:records>
</srw:searchRetrieveResponse>`;

function textResponse({
  status = 200,
  contentType = "application/xml; charset=utf-8",
  body = SAMPLE_SRU_XML,
} = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type" ? contentType : null;
      },
    },
    async text() {
      return body;
    },
  };
}

test("LexML adapter converts official-style SRU XML into the Mitra upstream contract", async () => {
  let captured = null;
  const adapter = createMitraPublicLexmlFetchAdapter({
    now: () => new Date("2026-09-07T23:00:00.000Z"),
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return textResponse();
    },
  });

  const response = await adapter.fetch(`${adapter.baseUrl}/search/global`, {
    method: "POST",
    body: JSON.stringify({ q: "responsabilidade civil médica", limit: 3 }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.source, "LexML");
  assert.equal(payload.results.length, 1);
  assert.equal(payload.results[0].title, "AgInt no AREsp 1518877 / DF");
  assert.match(payload.results[0].summary, /TRATAMENTO MÉDICO/);
  assert.match(payload.results[0].source_url, /^https:\/\/www\.lexml\.gov\.br\/urn\//);
  assert.equal(payload.results[0].raw.authority, "Superior Tribunal de Justiça. 2ª Turma");
  assert.equal(payload.queried_at, "2026-09-07T23:00:00.000Z");

  const requestUrl = new URL(captured.url);
  assert.equal(requestUrl.origin, "https://www.lexml.gov.br");
  assert.equal(requestUrl.pathname, "/busca/SRU");
  assert.equal(requestUrl.searchParams.get("operation"), "searchRetrieve");
  assert.equal(requestUrl.searchParams.get("recordSchema"), "dc");
  assert.equal(requestUrl.searchParams.get("maximumRecords"), "3");
  assert.match(requestUrl.searchParams.get("query"), /dc\.title any/);
  assert.match(requestUrl.searchParams.get("query"), /responsabilidade civil médica/);
  assert.equal(captured.options.method, "GET");
  assert.equal(captured.options.headers.authorization, undefined);
  assert.equal(captured.options.headers.cookie, undefined);
});

test("LexML adapter fails closed when the upstream returns an HTML verification challenge", async () => {
  const adapter = createMitraPublicLexmlFetchAdapter({
    fetchImpl: async () =>
      textResponse({
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><html><body>Verificando sua conexão</body></html>",
      }),
  });

  const response = await adapter.fetch(`${adapter.baseUrl}/search/global`, {
    method: "POST",
    body: JSON.stringify({ q: "responsabilidade civil médica", limit: 3 }),
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "lexml_challenge");
  assert.equal(payload.write_executed, false);
});

test("LexML adapter rejects a non-official SRU host", () => {
  assert.throws(
    () =>
      createMitraPublicLexmlFetchAdapter({
        sruUrl: "https://example.test/SRU",
        fetchImpl: async () => textResponse(),
      }),
    /www\.lexml\.gov\.br/,
  );
});

test("operational wrapper defaults to LexML and strips raw upstream payloads before browser response", async () => {
  let baseDelegated = 0;
  const wrapper = createMitraPublicOperationalWrapper({
    app: {
      async handleRequest() {
        baseDelegated += 1;
        return { status: 200, headers: {}, body: "base" };
      },
    },
    env: {},
    fetchImpl: async () => textResponse(),
  });

  assert.equal(wrapper.descriptor.provider, "lexml_sru");
  assert.equal(wrapper.descriptor.configured, true);
  assert.equal(wrapper.descriptor.writeExecuted, false);

  const health = await wrapper.app.handleRequest({
    method: "GET",
    url: "/v1/mitra/public/health",
    headers: { origin: PREVIEW_ORIGIN },
  });
  assert.equal(health.status, 200);

  const search = await wrapper.app.handleRequest({
    method: "POST",
    url: "/v1/mitra/public/search",
    headers: {
      origin: PREVIEW_ORIGIN,
      "content-type": "application/json",
      "x-real-ip": "203.0.113.20",
    },
    body: JSON.stringify({ query: "responsabilidade civil médica", limit: 3 }),
  });
  const payload = JSON.parse(search.body);

  assert.equal(search.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.source, "LexML");
  assert.equal(payload.results.length, 1);
  assert.equal(payload.results[0].source, "LexML");
  assert.equal(payload.results[0].raw, undefined);
  assert.equal(payload.raw, undefined);
  assert.equal(baseDelegated, 0);
});

test("explicit HTTPS upstream overrides the built-in LexML provider", () => {
  let capturedOptions = null;
  const externalFetch = async () => {
    throw new Error("not called");
  };

  const wrapper = createMitraPublicOperationalWrapper({
    app: {
      async handleRequest() {
        return { status: 200, headers: {}, body: "base" };
      },
    },
    env: {
      MITRA_PUBLIC_RESEARCH_UPSTREAM_BASE_URL: "https://juridico.example.test",
      MITRA_PUBLIC_RESEARCH_UPSTREAM_BEARER: "server-only",
    },
    fetchImpl: externalFetch,
    lexmlAdapterFactory: () => {
      throw new Error("LexML adapter must not be created for explicit upstream");
    },
    facadeFactory(options) {
      capturedOptions = options;
      return {
        configured: true,
        async handleRequest() {
          return null;
        },
      };
    },
  });

  assert.equal(wrapper.descriptor.provider, "external_https");
  assert.equal(wrapper.descriptor.configured, true);
  assert.equal(capturedOptions.upstreamBaseUrl, "https://juridico.example.test");
  assert.equal(capturedOptions.upstreamBearer, "server-only");
  assert.equal(capturedOptions.fetchImpl, externalFetch);
});
