import test from "node:test";
import assert from "node:assert/strict";

import { createUnicoWhatsAppConnector } from "../src/connectors/unico-whatsapp.mjs";

test("UNICO WhatsApp adapter maps provider metadata without message-body leakage", async () => {
  const calls = [];
  const connector = createUnicoWhatsAppConnector({
    domain: "legal",
    searchInbound: async (request) => {
      calls.push(request);
      return {
        ok: true,
        mode: "search",
        query: request.query,
        channel: null,
        count: 1,
        results: [
          {
            id: "provider-msg-42",
            channel: "LEGAL",
            timestamp: "2026-10-05T20:00:00.000Z",
            text: "texto confidencial que não deve atravessar o gate",
            phone: "0000000000",
            contactName: "Pessoa Privada",
          },
        ],
        messagesSent: false,
        secretsExposed: false,
        release: "zuni-ada-inbound-search-v8",
      };
    },
  });

  const results = await connector.search({
    query: "documento",
    domains: ["legal"],
    requestedAt: "2026-10-05T20:30:00.000Z",
  });

  assert.deepEqual(calls, [{ query: "documento" }]);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Mensagem WhatsApp");
  assert.equal(results[0].domain, "legal");
  assert.equal(results[0].sensitivity, "confidential");
  assert.match(results[0].providerObjectId, /^sha256:[a-f0-9]{64}$/);
  assert.match(results[0].evidenceDigest, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(results[0]), /texto confidencial/);
  assert.doesNotMatch(JSON.stringify(results[0]), /Pessoa Privada/);
  assert.doesNotMatch(JSON.stringify(results[0]), /0000000000/);
  assert.doesNotMatch(JSON.stringify(results[0]), /provider-msg-42/);
});

test("UNICO WhatsApp adapter accepts empty real-provider-shaped search results", async () => {
  const connector = createUnicoWhatsAppConnector({
    searchInbound: async ({ query }) => ({
      ok: true,
      mode: "search",
      query,
      channel: null,
      count: 0,
      results: [],
      messagesSent: false,
      secretsExposed: false,
      release: "zuni-ada-inbound-search-v8",
    }),
  });

  const results = await connector.search({
    query: "probe",
    domains: ["corporate"],
    requestedAt: "2026-10-05T20:30:00.000Z",
  });

  assert.deepEqual(results, []);
});

test("UNICO WhatsApp adapter refuses provider responses that report sends", async () => {
  const connector = createUnicoWhatsAppConnector({
    searchInbound: async () => ({
      ok: true,
      results: [],
      messagesSent: true,
      secretsExposed: false,
    }),
  });

  await assert.rejects(
    connector.search({
      query: "x",
      domains: ["corporate"],
      requestedAt: "2026-10-05T20:30:00.000Z",
    }),
    (error) => error.code === "WHATSAPP_READ_ONLY_VIOLATION",
  );
});

test("UNICO WhatsApp adapter refuses secret exposure", async () => {
  const connector = createUnicoWhatsAppConnector({
    searchInbound: async () => ({
      ok: true,
      results: [],
      messagesSent: false,
      secretsExposed: true,
    }),
  });

  await assert.rejects(
    connector.search({
      query: "x",
      domains: ["corporate"],
      requestedAt: "2026-10-05T20:30:00.000Z",
    }),
    (error) => error.code === "WHATSAPP_SECRET_EXPOSURE",
  );
});
