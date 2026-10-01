import test from "node:test";
import assert from "node:assert/strict";

import {
  createPublicResearchClient,
  PublicResearchError,
} from "../src/public-research-client.js";

test("public research client uses same-origin jurisprudence facade by default", async () => {
  let captured;
  const client = createPublicResearchClient({
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            adapterId: "mitra.buscar_jurisprudencia",
            source: "Mitra Jurisprudência Pública",
            results: [
              {
                id: "ac-1",
                title: "Resultado público",
                source: "LexML",
                url: "https://example.test/fonte",
                court: "STJ",
                date: "2026-01-02",
              },
            ],
          };
        },
      };
    },
  });

  assert.equal(client.configured, true);

  const response = await client.search({ query: "tema jurídico", tribunal: "STJ", limit: 99 });

  assert.equal(captured.url, "/v1/mitra/public/jurisprudencia?q=tema+jur%C3%ADdico&tribunal=STJ&limit=20");
  assert.equal(captured.options.method, "GET");
  assert.equal(captured.options.credentials, "omit");
  assert.equal(captured.options.headers.authorization, undefined);
  assert.equal(captured.options.headers.Authorization, undefined);
  assert.equal(captured.options.body, undefined);
  assert.equal(response.adapterId, "mitra.buscar_jurisprudencia");
  assert.equal(response.results[0].title, "Resultado público");
  assert.equal(response.results[0].source, "LexML");
});

test("public research client supports https base URL and custom endpoint", async () => {
  let captured;
  const client = createPublicResearchClient({
    baseUrl: "https://mitra.example.test",
    endpointPath: "/jurisprudencia",
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, results: [] };
        },
      };
    },
  });

  await client.search({
    query: "contrato",
    tribunal: "TJSP",
    limit: 5,
    periodFrom: "2026-01-01",
    periodTo: "2026-01-31",
  });

  assert.equal(captured.url, "https://mitra.example.test/jurisprudencia?q=contrato&tribunal=TJSP&periodFrom=2026-01-01&periodTo=2026-01-31&limit=5");
  assert.equal(captured.options.method, "GET");
  assert.equal(captured.options.credentials, "omit");
});

test("public research client rejects insecure remote base URLs", () => {
  assert.throws(
    () => createPublicResearchClient({ baseUrl: "http://gateway.example.test" }),
    (error) => error instanceof PublicResearchError && error.code === "insecure_base_url",
  );
});

test("public research client requires a non-empty query", async () => {
  const client = createPublicResearchClient({
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });

  await assert.rejects(
    () => client.search({ query: "  " }),
    (error) => error instanceof PublicResearchError && error.code === "query_required",
  );
});
