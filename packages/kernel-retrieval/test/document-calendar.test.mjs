
import test from "node:test";
import assert from "node:assert/strict";

import { createDocumentStoreConnector } from "../src/connectors/document-store.mjs";
import { createCalendarConnector } from "../src/connectors/calendar.mjs";

test("document-store adapter returns metadata only and hashes provider ids", async () => {
  const connector = createDocumentStoreConnector({
    id: "drive-main",
    domain: "corporate",
    searchFiles: async ({ query, limit }) => ({
      ok: true,
      mutated: false,
      files: [{
        id: "provider-file-42",
        name: `Arquivo ${query}`,
        mimeType: "application/pdf",
        modifiedTime: "2026-10-05T12:00:00Z",
        size: "1200",
        webViewLink: "https://provider.invalid/private",
        body: "conteudo privado",
      }].slice(0, limit),
    }),
  });

  const [result] = await connector.search({
    query: "contrato",
    limit: 10,
    requestedAt: "2026-10-05T20:00:00Z",
  });

  assert.equal(result.title, "Arquivo contrato");
  assert.match(result.providerObjectId, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.evidenceDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.uri.includes("provider-file-42"), false);
  assert.equal(JSON.stringify(result).includes("conteudo privado"), false);
  assert.equal(JSON.stringify(result).includes("provider.invalid"), false);
});

test("document-store adapter rejects provider mutation", async () => {
  const connector = createDocumentStoreConnector({
    searchFiles: async () => ({ ok: true, mutated: true, files: [] }),
  });

  await assert.rejects(
    connector.search({ query: "x", requestedAt: "2026-10-05T20:00:00Z" }),
    (error) => error.code === "DRIVE_READ_ONLY_VIOLATION",
  );
});

test("calendar adapter minimizes attendees, links, descriptions and locations", async () => {
  const connector = createCalendarConnector({
    searchEvents: async () => ({
      ok: true,
      mutated: false,
      events: [{
        id: "evt-7",
        summary: "Reuniao de trabalho",
        start: { dateTime: "2026-10-06T13:00:00-03:00" },
        end: { dateTime: "2026-10-06T14:00:00-03:00" },
        status: "confirmed",
        attendees: [{ email: "private@example.invalid" }],
        description: "conteudo privado",
        hangoutLink: "https://meet.invalid/private",
        location: "endereco privado",
      }],
    }),
  });

  const [result] = await connector.search({
    query: "reuniao",
    requestedAt: "2026-10-05T20:00:00Z",
  });

  assert.equal(result.title, "Reuniao de trabalho");
  assert.equal(JSON.stringify(result).includes("private@example.invalid"), false);
  assert.equal(JSON.stringify(result).includes("conteudo privado"), false);
  assert.equal(JSON.stringify(result).includes("meet.invalid"), false);
  assert.equal(JSON.stringify(result).includes("endereco privado"), false);
  assert.match(result.providerObjectId, /^sha256:[a-f0-9]{64}$/);
});

test("calendar adapter rejects provider mutation", async () => {
  const connector = createCalendarConnector({
    searchEvents: async () => ({ ok: true, mutated: true, events: [] }),
  });

  await assert.rejects(
    connector.search({ query: "x", requestedAt: "2026-10-05T20:00:00Z" }),
    (error) => error.code === "CALENDAR_READ_ONLY_VIOLATION",
  );
});
