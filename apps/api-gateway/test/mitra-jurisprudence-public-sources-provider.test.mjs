import assert from "node:assert/strict";
import test from "node:test";

import { createDatajudJurisprudenceProvider } from "../src/mitra-jurisprudence-datajud-provider.mjs";
import { createLexmlJurisprudenceProvider } from "../src/mitra-jurisprudence-lexml-provider.mjs";
import { createPublicJurisprudenceProviderFromEnv, getPublicJurisprudenceProviderConfigStatus } from "../src/mitra-jurisprudence-public-sources-provider-config.mjs";

const LEXML_XML = `<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/" xmlns:dc="http://purl.org/dc/elements/1.1/"><srw:record><srw:recordData><dc:title> Tema público LexML </dc:title><dc:identifier>https://www.lexml.gov.br/urn/1</dc:identifier><dc:source>STJ</dc:source><dc:date>2026-01-01</dc:date><dc:description> Jurisprudência pública </dc:description><dc:type>jurisprudencia</dc:type></srw:recordData></srw:record></srw:searchRetrieveResponse>`;

const DATAJUD = {
  hits: { hits: [{ _source: { numeroProcesso: "0000001-00.2026.3.00.0000", tribunal: "STJ", classe: { nome: "Recurso Especial" }, dataAjuizamento: "2026-01-02T00:00:00.000Z", access_token: "must-not-leak" } }] },
};

test("LexML provider uses safe SRU GET and normalizes XML", async () => {
  const calls = [];
  const provider = createLexmlJurisprudenceProvider({
    enabled: true,
    sruUrl: "https://www.lexml.gov.br/busca/SRU",
    allowedHosts: ["www.lexml.gov.br"],
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      return { ok: true, status: 200, async text() { return LEXML_XML; } };
    },
  });

  const output = await provider.search({ q: "tema", limit: 2 });

  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].url.includes("operation=searchRetrieve"), true);
  assert.equal(output.results[0].source, "LexML");
  assert.equal(output.results[0].title, "Tema público LexML");
});

test("DataJud provider uses safe read-only search request and strips unsafe fields", async () => {
  const calls = [];
  const provider = createDatajudJurisprudenceProvider({
    enabled: true,
    baseUrl: "https://api-publica.datajud.cnj.jus.br",
    apiKey: "public-api-key",
    allowedHosts: ["api-publica.datajud.cnj.jus.br"],
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      return { ok: true, status: 200, async json() { return DATAJUD; } };
    },
  });

  const output = await provider.search({ q: "direito civil", tribunal: "STJ", limit: 1 });

  assert.equal(calls[0].url, "https://api-publica.datajud.cnj.jus.br/api_publica_stj/_search");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, "APIKey public-api-key");
  assert.equal(output.results[0].source, "DataJud/CNJ");
  assert.equal(JSON.stringify(output).includes("must-not-leak"), false);
});

test("Public sources config stays disabled by default and exposes only presence metadata", async () => {
  let calls = 0;
  const provider = createPublicJurisprudenceProviderFromEnv({ env: {}, fetchFn: async () => { calls += 1; return {}; } });

  assert.equal(provider.enabled, false);
  await assert.rejects(() => provider.search({ q: "tema" }), /public_sources_provider_disabled/);
  assert.equal(calls, 0);
  assert.deepEqual(getPublicJurisprudenceProviderConfigStatus({}), {
    providerId: "public-sources",
    enabled: false,
    lexml: { enabled: false, sruUrlPresent: false, allowedHostCount: 0, timeoutMsPresent: false },
    datajud: { enabled: false, baseUrlPresent: false, apiKeyPresent: false, allowedHostCount: 0, timeoutMsPresent: false },
  });
});

test("Public sources config composes LexML and DataJud from env without leaking values", async () => {
  const calls = [];
  const env = {
    MITRA_LEXML_PROVIDER_ENABLED: "true",
    MITRA_LEXML_SRU_URL: "https://www.lexml.gov.br/busca/SRU",
    MITRA_LEXML_ALLOWED_HOSTS: "www.lexml.gov.br",
    MITRA_DATAJUD_PROVIDER_ENABLED: "true",
    MITRA_DATAJUD_BASE_URL: "https://api-publica.datajud.cnj.jus.br",
    MITRA_DATAJUD_ALLOWED_HOSTS: "api-publica.datajud.cnj.jus.br",
    MITRA_DATAJUD_API_KEY: "public-api-key",
  };
  const provider = createPublicJurisprudenceProviderFromEnv({
    env,
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("lexml")) return { ok: true, status: 200, async text() { return LEXML_XML; } };
      return { ok: true, status: 200, async json() { return DATAJUD; } };
    },
  });

  const output = await provider.search({ q: "tema", tribunal: "STJ", limit: 5 });
  const status = getPublicJurisprudenceProviderConfigStatus(env);

  assert.equal(provider.enabled, true);
  assert.deepEqual(provider.providerIds, ["lexml", "datajud"]);
  assert.equal(calls.length, 2);
  assert.deepEqual(output.results.map((result) => result.source), ["LexML", "DataJud/CNJ"]);
  assert.equal(JSON.stringify(status).includes("public-api-key"), false);
  assert.equal(JSON.stringify(status).includes("api-publica.datajud.cnj.jus.br"), false);
});
