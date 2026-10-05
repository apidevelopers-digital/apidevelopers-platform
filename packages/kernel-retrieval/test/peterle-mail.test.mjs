import test from "node:test";
import assert from "node:assert/strict";

import { createPeterleMailConnector } from "../src/connectors/peterle-mail.mjs";

test("Peterle mail adapter maps real provider response shape without body leakage", async () => {
  const calls = [];
  const connector = createPeterleMailConnector({
    searchMail: async (request) => {
      calls.push(request);
      return {
        ok: true,
        release: "institutional-mail-control-v2",
        account: "milena",
        count: 1,
        messages: [
          {
            account: "milena",
            mailbox: "INBOX",
            uid: 2069,
            date: "Mon, 5 Oct 2026 14:10:23 -0300",
            internalDate: "05-Oct-2026 17:10:29 +0000",
            from: '"servicos@cbl.org.br" <servicos@cbl.org.br>',
            to: "milena@peterle.adv.br",
            subject: "BNWeb: 402919 - Ficha Catalográfica",
            messageId: "<fixture@cbl.org.br>",
            contentType: "text/html; charset=utf-8",
            attachmentHint: false,
            bodyReturned: false,
          },
        ],
        bodyReturned: false,
        readOnly: true,
        execution: false,
      };
    },
  });

  const results = await connector.search({
    tenantId: "peterle",
    query: "Ficha Catalográfica",
    domains: ["legal"],
    limit: 10,
    requestedAt: "2026-10-05T20:30:00.000Z",
  });

  assert.deepEqual(calls, [
    {
      account: "milena",
      mailbox: "INBOX",
      query: "Ficha Catalográfica",
      limit: 10,
    },
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "mail:milena:INBOX:2069");
  assert.equal(results[0].domain, "legal");
  assert.equal(results[0].title, "BNWeb: 402919 - Ficha Catalográfica");
  assert.match(results[0].snippet, /servicos@cbl\.org\.br/);
  assert.equal(results[0].providerObjectId, "uid:2069");
  assert.match(results[0].evidenceDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal("text" in results[0], false);
  assert.equal("html" in results[0], false);
  assert.equal("attachments" in results[0], false);
});

test("Peterle mail adapter rejects provider message without uid", async () => {
  const connector = createPeterleMailConnector({
    searchMail: async () => ({ ok: true, messages: [{ subject: "x" }] }),
  });

  await assert.rejects(
    connector.search({
      query: "x",
      domains: ["corporate"],
      limit: 1,
      requestedAt: "2026-10-05T20:30:00.000Z",
    }),
    (error) => error.code === "INVALID_MAIL_PROVIDER_RESPONSE",
  );
});

test("Peterle mail adapter rejects failed provider responses", async () => {
  const connector = createPeterleMailConnector({
    searchMail: async () => ({ ok: false, partial: true, errors: ["timeout"] }),
  });

  await assert.rejects(
    connector.search({
      query: "x",
      domains: ["corporate"],
      limit: 1,
      requestedAt: "2026-10-05T20:30:00.000Z",
    }),
    (error) => error.code === "MAIL_PROVIDER_SEARCH_FAILED",
  );
});
