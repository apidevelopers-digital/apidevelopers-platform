import test from "node:test";
import assert from "node:assert/strict";

import {
  createMitraPublicResearchFacade,
} from "../src/mitra-public-research.mjs";
import {
  createMitraPublicGatewayApp,
} from "../src/mitra-public-server.mjs";

const PREVIEW_ORIGIN = "https://preview-apidevelopers.apidevelopers.digital";

function parse(result) {
  return JSON.parse(result.body || "{}");
}

test("Mitra public research stays unavailable until an upstream is configured", async () => {
  const facade = createMitraPublicResearchFacade({
    upstreamBaseUrl: "",
    rateLimitMax: 10,
  });

  const result = await facade.handleRequest({
    method: "POST",
    url: "/v1/mitra/public/search",
    headers: { origin: PREVIEW_ORIGIN, "x-real-ip": "203.0.113.10" },
    body: JSON.stringify({ query: "responsabilidade civil" }),
  });

  assert.equal(result.status, 503);
  assert.equal(parse(result).error, "upstream_not_configured");
  assert.equal(result.headers["access-control-allow-origin"], PREVIEW_ORIGIN);
});

test("Mitra public research rejects browser origins outside the allowlist", async () => {
  const facade = createMitraPublicResearchFacade({
    upstreamBaseUrl: "https://juridico.example.test",
  });

  const result = await facade.handleRequest({
    method: "POST",
    url: "/v1/mitra/public/search",
    headers: { origin: "https://evil.example.test" },
    body: JSON.stringify({ query: "jurisprudência" }),
  });

  assert.equal(result.status, 403);
  assert.equal(parse(result).error, "origin_not_allowed");
  assert.equal(result.headers["access-control-allow-origin"], undefined);
});

test("Mitra public research keeps upstream bearer server-side and removes raw payloads", async () => {
  let captured = null;

  const facade = createMitraPublicResearchFacade({
    upstreamBaseUrl: "https://juridico.example.test",
    upstreamBearer: "server-only-secret",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            source: "LexML",
            source_url: "https://www.lexml.gov.br/",
            confidence: "media",
            legal_warning: "Pesquisa pública auxiliar.",
            queried_at: "2026-09-07T23:30:00Z",
            results: [
              {
                title: "Lei de exemplo",
                source: "LexML",
                source_url: "https://www.lexml.gov.br/urn/urn:lex:br:federal:lei:2020",
                raw: {
                  ementa: "Resumo público da norma.",
                  internal_debug: "must-not-leak",
                },
              },
            ],
            raw: { upstream_debug: true },
          };
        },
      };
    },
  });

  const result = await facade.handleRequest({
    method: "POST",
    url: "/v1/mitra/public/search",
    headers: {
      origin: PREVIEW_ORIGIN,
      authorization: "Bearer browser-must-not-forward",
      cookie: "private=session",
      "x-real-ip": "203.0.113.11",
    },
    body: JSON.stringify({ query: "lei exemplo", limit: 8 }),
  });

  assert.equal(result.status, 200);
  assert.equal(captured.url, "https://juridico.example.test/search/global");
  assert.equal(captured.options.headers.authorization, "Bearer server-only-secret");
  assert.equal(captured.options.headers.cookie, undefined);
  assert.deepEqual(JSON.parse(captured.options.body), { q: "lei exemplo", limit: 8 });

  const payload = parse(result);
  assert.equal(payload.results.length, 1);
  assert.equal(payload.results[0].summary, "Resumo público da norma.");
  assert.equal(payload.results[0].source, "LexML");
  assert.equal(payload.results[0].raw, undefined);
  assert.equal(payload.raw, undefined);
});

test("Mitra public research rate limits by trusted proxy client key", async () => {
  let now = 1_000;

  const facade = createMitraPublicResearchFacade({
    upstreamBaseUrl: "https://juridico.example.test",
    rateLimitMax: 1,
    rateLimitWindowMs: 60_000,
    now: () => now,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { ok: true, results: [] };
      },
    }),
  });

  const request = {
    method: "POST",
    url: "/v1/mitra/public/search",
    headers: { origin: PREVIEW_ORIGIN, "x-real-ip": "203.0.113.12" },
    body: JSON.stringify({ query: "tema jurídico" }),
  };

  const first = await facade.handleRequest(request);
  const second = await facade.handleRequest(request);

  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.equal(parse(second).error, "rate_limited");

  now += 61_000;
  const third = await facade.handleRequest(request);
  assert.equal(third.status, 200);
});

test("Mitra public gateway wrapper delegates non-Mitra routes to the existing gateway", async () => {
  const gatewayCalls = [];
  const researchCalls = [];

  const app = createMitraPublicGatewayApp({
    gatewayApp: {
      async handleRequest(request) {
        gatewayCalls.push(request);
        return { status: 200, headers: {}, body: "gateway" };
      },
    },
    publicResearch: {
      async handleRequest(request) {
        researchCalls.push(request);
        return { status: 200, headers: {}, body: "mitra" };
      },
    },
  });

  const health = await app.handleRequest({ method: "GET", url: "/health" });
  const search = await app.handleRequest({ method: "POST", url: "/v1/mitra/public/search" });

  assert.equal(health.body, "gateway");
  assert.equal(search.body, "mitra");
  assert.equal(gatewayCalls.length, 1);
  assert.equal(researchCalls.length, 1);
});
