import test from "node:test";
import assert from "node:assert/strict";

import {
  createMitraPublicLexmlFetchAdapter,
} from "../src/mitra-public-lexml-upstream.mjs";

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

test("LexML diagnostic adapter converts official-style SRU XML into the Mitra upstream contract", async () => {
  let captured = null;
  const adapter = createMitraPublicLexmlFetchAdapter({
    now: () => new Date("2026-09-08T03:00:00.000Z"),
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

  const requestUrl = new URL(captured.url);
  assert.equal(requestUrl.origin, "https://www.lexml.gov.br");
  assert.equal(requestUrl.pathname, "/busca/SRU");
  assert.equal(requestUrl.searchParams.get("operation"), "searchRetrieve");
  assert.equal(requestUrl.searchParams.get("recordSchema"), "dc");
  assert.equal(requestUrl.searchParams.get("maximumRecords"), "3");
  assert.match(requestUrl.searchParams.get("query"), /responsabilidade civil médica/);
  assert.equal(captured.options.method, "GET");
  assert.equal(captured.options.headers.authorization, undefined);
  assert.equal(captured.options.headers.cookie, undefined);
});

test("LexML diagnostic adapter fails closed on the current Senate verification challenge", async () => {
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

test("LexML diagnostic adapter rejects a non-official SRU host", () => {
  assert.throws(
    () =>
      createMitraPublicLexmlFetchAdapter({
        sruUrl: "https://example.test/SRU",
        fetchImpl: async () => textResponse(),
      }),
    /www\.lexml\.gov\.br/,
  );
});
