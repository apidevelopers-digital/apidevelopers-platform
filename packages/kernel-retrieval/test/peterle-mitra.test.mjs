
import test from "node:test";
import assert from "node:assert/strict";

import { createPeterleMitraConnector } from "../src/connectors/peterle-mitra.mjs";

test("Peterle/Mitra adapter combines sanitized client and matter metadata", async () => {
  const connector = createPeterleMitraConnector({
    searchClients: async ({ query }) => ({
      ok: true,
      read_only: true,
      execution: false,
      results: [{
        id: "CLI-TEST-0001",
        display_name: `Cliente ${query}`,
        secret_note: "never expose",
      }],
    }),
    searchMatters: async ({ query }) => ({
      ok: true,
      read_only: true,
      execution: false,
      rows: [{
        id: "MAT-TEST-0001",
        client_id: "CLI-TEST-0001",
        title: `Assunto ${query}`,
        status: "active",
        created_at: "2026-10-01T12:00:00Z",
        document_body: "conteudo juridico privado",
      }],
    }),
  });

  const results = await connector.search({
    query: "contrato",
    limit: 10,
    requestedAt: "2026-10-05T21:00:00Z",
  });

  assert.equal(results.length, 2);
  assert.equal(results[0].title, "Cliente contrato");
  assert.equal(results[1].title, "Assunto contrato");
  assert.equal(results[1].domain, "legal");
  assert.equal(results[1].sensitivity, "confidential");
  assert.match(results[0].providerObjectId, /^sha256:[a-f0-9]{64}$/);
  assert.match(results[1].providerObjectId, /^sha256:[a-f0-9]{64}$/);

  const serialized = JSON.stringify(results);
  assert.equal(serialized.includes("CLI-TEST-0001"), false);
  assert.equal(serialized.includes("MAT-TEST-0001"), false);
  assert.equal(serialized.includes("never expose"), false);
  assert.equal(serialized.includes("conteudo juridico privado"), false);
});

test("Peterle/Mitra adapter rejects writable provider responses", async () => {
  const connector = createPeterleMitraConnector({
    searchClients: async () => ({
      ok: true,
      read_only: false,
      execution: true,
      results: [],
    }),
    searchMatters: async () => ({
      ok: true,
      read_only: true,
      execution: false,
      results: [],
    }),
  });

  await assert.rejects(
    connector.search({
      query: "x",
      requestedAt: "2026-10-05T21:00:00Z",
    }),
    (error) => error.code === "MITRA_READ_ONLY_VIOLATION",
  );
});
