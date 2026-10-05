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
        account: "primary",
        count: 1,
        messages: [
          {
            account: "primary",
            mailbox: "INBOX",
            uid: 4242,
            date: "Mon, 5 Oct 2026 14:10:23 -0300",
            internalDate: "05-Oct-2026 17:10:29 +0000",
            from: '"registry@example.invalid" <registry@example.invalid>',
            to: "curadoria@example.invalid",
            subject: "Documento de registro disponível",
            messageId: "<fixture@example.invalid>",
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
    query: "documento de registro",
    domains: ["legal"],
    limit: 10,
    requestedAt: "2026-10-05T20:30:00.000Z",
  });

  assert.deepEqual(calls, [
    {
      account: "primary",
      mailbox: "INBOX",
      query: "documento de registro",
      limit: 10,
    },
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "mail:primary:INBOX:4242");
  assert.equal(results[0].domain, "legal");
  assert.equal(results[0].title, "Documento de registro disponível");
  assert.match(results[0].snippet, /registry@example\.invalid/);
  assert.equal(results[0].providerObjectId, "uid:4242");
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
