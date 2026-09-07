import test from "node:test";
import assert from "node:assert/strict";

import {
  createPublicResearchClient,
  PublicResearchError,
} from "../src/public-research-client.js";

test("public research client stays unconfigured without an API base URL", async () => {
  const client = createPublicResearchClient();
  assert.equal(client.configured, false);

  await assert.rejects(
    () => client.search({ query: "responsabilidade civil" }),
    (error) => error instanceof PublicResearchError && error.code === "not_configured",
  );
});

test("public research client never sends browser credentials or authorization", async () => {
  let captured;
  const client = createPublicResearchClient({
    baseUrl: "https://gateway.example.test",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            results: [
              {
                title: "Resultado público",
                source: "Fonte aberta",
                source_url: "https://example.test/fonte",
              },
            ],
          };
        },
      };
    },
  });

  const response = await client.search({ query: "tema jurídico", limit: 99 });

  assert.equal(captured.url, "https://gateway.example.test/v1/mitra/public/search");
  assert.equal(captured.options.credentials, "omit");
  assert.equal(captured.options.headers.authorization, undefined);
  assert.equal(captured.options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(captured.options.body), {
    query: "tema jurídico",
    limit: 20,
  });
  assert.equal(response.results[0].title, "Resultado público");
});

test("public research client rejects insecure remote base URLs", () => {
  assert.throws(
    () => createPublicResearchClient({ baseUrl: "http://gateway.example.test" }),
    (error) => error instanceof PublicResearchError && error.code === "insecure_base_url",
  );
});

test("public research client requires a non-empty query", async () => {
  const client = createPublicResearchClient({
    baseUrl: "https://gateway.example.test",
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });

  await assert.rejects(
    () => client.search({ query: "  " }),
    (error) => error instanceof PublicResearchError && error.code === "query_required",
  );
});
