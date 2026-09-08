import test from "node:test";
import assert from "node:assert/strict";

import {
  createMitraPublicCamaraFetchAdapter,
} from "../src/mitra-public-camara-upstream.mjs";
import {
  createMitraPublicOperationalWrapper,
} from "../src/mitra-public-operational-wrapper.mjs";

const PREVIEW_ORIGIN = "https://preview-apidevelopers.apidevelopers.digital";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type"
          ? "application/json; charset=utf-8"
          : null;
      },
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

const SAMPLE = {
  dados: [
    {
      id: 2450001,
      uri: "https://dadosabertos.camara.leg.br/api/v2/proposicoes/2450001",
      siglaTipo: "PL",
      numero: 1234,
      ano: 2026,
      ementa: "Dispõe sobre responsabilidade civil em serviços de saúde.",
    },
  ],
  links: [],
};

test("Câmara adapter maps the official propositions API into Mitra's upstream contract", async () => {
  let captured = null;
  const adapter = createMitraPublicCamaraFetchAdapter({
    now: () => new Date("2026-09-08T03:30:00.000Z"),
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return jsonResponse(SAMPLE);
    },
  });

  const response = await adapter.fetch(`${adapter.baseUrl}/search/global`, {
    method: "POST",
    body: JSON.stringify({ q: "responsabilidade civil", limit: 3 }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.source, "Câmara dos Deputados — Dados Abertos");
  assert.equal(payload.results.length, 1);
  assert.equal(payload.results[0].title, "PL 1234/2026");
  assert.match(payload.results[0].summary, /responsabilidade civil/);
  assert.equal(payload.results[0].source_url, SAMPLE.dados[0].uri);
  assert.equal(payload.queried_at, "2026-09-08T03:30:00.000Z");
  assert.equal(payload.write_executed, false);

  const requestUrl = new URL(captured.url);
  assert.equal(requestUrl.origin, "https://dadosabertos.camara.leg.br");
  assert.equal(requestUrl.pathname, "/api/v2/proposicoes");
  assert.equal(requestUrl.searchParams.get("keywords"), "responsabilidade civil");
  assert.equal(requestUrl.searchParams.get("itens"), "3");
  assert.equal(captured.options.method, "GET");
  assert.equal(captured.options.headers.authorization, undefined);
  assert.equal(captured.options.headers.cookie, undefined);
});

test("Câmara adapter rejects non-official base URLs", () => {
  assert.throws(
    () =>
      createMitraPublicCamaraFetchAdapter({
        baseUrl: "https://example.test/api",
        fetchImpl: async () => jsonResponse(SAMPLE),
      }),
    /dadosabertos\.camara\.leg\.br/,
  );
});

test("Câmara adapter fails closed on non-JSON responses", async () => {
  const adapter = createMitraPublicCamaraFetchAdapter({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "text/html; charset=utf-8" },
      async text() {
        return "<html>unexpected</html>";
      },
    }),
  });

  const response = await adapter.fetch(`${adapter.baseUrl}/search/global`, {
    method: "POST",
    body: JSON.stringify({ q: "responsabilidade civil", limit: 3 }),
  });
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "camara_invalid_content_type");
  assert.equal(payload.write_executed, false);
});

test("operational wrapper defaults to Câmara and keeps browser output normalized", async () => {
  let delegated = 0;
  const wrapper = createMitraPublicOperationalWrapper({
    app: {
      async handleRequest() {
        delegated += 1;
        return { status: 200, headers: {}, body: "base" };
      },
    },
    env: {},
    fetchImpl: async () => jsonResponse(SAMPLE),
  });

  assert.equal(wrapper.descriptor.provider, "camara_dados_abertos");
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
      "x-real-ip": "203.0.113.30",
    },
    body: JSON.stringify({ query: "responsabilidade civil", limit: 3 }),
  });
  const payload = JSON.parse(search.body);

  assert.equal(search.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.source, "Câmara dos Deputados — Dados Abertos");
  assert.equal(payload.results.length, 1);
  assert.equal(payload.results[0].source, "Câmara dos Deputados — Dados Abertos");
  assert.equal(payload.results[0].raw, undefined);
  assert.equal(payload.raw, undefined);
  assert.equal(delegated, 0);
});

test("explicit HTTPS upstream still overrides the built-in Câmara provider", () => {
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
    camaraAdapterFactory: () => {
      throw new Error("Câmara adapter must not be created for explicit upstream");
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
  assert.equal(capturedOptions.upstreamBaseUrl, "https://juridico.example.test");
  assert.equal(capturedOptions.upstreamBearer, "server-only");
  assert.equal(capturedOptions.fetchImpl, externalFetch);
});
