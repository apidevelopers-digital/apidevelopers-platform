
import test from "node:test";
import assert from "node:assert/strict";

import { createRetrievalRuntime } from "../src/retrieval-runtime.mjs";

test("retrieval runtime is disabled by default and performs no provider work", async () => {
  let providerCalls = 0;
  const runtime = createRetrievalRuntime({
    providers: {
      searchMail: async () => {
        providerCalls += 1;
        return { ok: true, messages: [] };
      },
    },
  });

  assert.equal(runtime.enabled, false);
  assert.equal(runtime.status, "disabled");
  await assert.rejects(
    runtime.search({}),
    (error) => error.code === "RETRIEVAL_RUNTIME_DISABLED",
  );
  assert.equal(providerCalls, 0);
});

test("enabled retrieval runtime requires governance dependencies", () => {
  assert.throws(
    () => createRetrievalRuntime({
      enabled: true,
      tenantId: "tenant-test",
      redact: async ({ text }) => ({ text, applied: false, redactions: 0 }),
    }),
    (error) => error.code === "RETRIEVAL_RUNTIME_DEPENDENCY_REQUIRED",
  );
});

test("enabled runtime can compose with no live providers and stays read-only", async () => {
  const audits = [];
  const runtime = createRetrievalRuntime({
    enabled: true,
    tenantId: "tenant-test",
    services: {
      authorize: async () => ({ authorizationId: "authz-1", allow: true }),
      evaluatePolicy: async () => ({ decisionId: "policy-1", effect: "allow", riskLevel: "R4" }),
      audit: async (event) => {
        audits.push(event);
        return { ok: true };
      },
    },
    redact: async ({ text }) => ({ text, applied: false, redactions: 0 }),
    clock: () => "2026-10-05T23:00:00.000Z",
  });

  assert.equal(runtime.enabled, true);
  assert.equal(runtime.status, "ready");
  assert.deepEqual(runtime.connectorIds, []);
  assert.deepEqual(runtime.resolverIds, []);

  const response = await runtime.search({
    tenantId: "tenant-test",
    query: "status",
    domains: ["corporate"],
  });

  assert.equal(response.connectorCount, 0);
  assert.deepEqual(response.results, []);
  assert.equal(audits.length, 0);
});

test("enabled runtime wires sanitized mail connector only when provider is injected", async () => {
  const runtime = createRetrievalRuntime({
    enabled: true,
    tenantId: "tenant-test",
    services: {
      authorize: async () => ({ authorizationId: "authz-1", allow: true }),
      evaluatePolicy: async () => ({ decisionId: "policy-1", effect: "allow", riskLevel: "R4" }),
      audit: async () => ({ ok: true }),
    },
    providers: {
      mailAccount: "primary",
      searchMail: async () => ({
        ok: true,
        messages: [{
          uid: 7,
          subject: "Documento disponível",
          from: "registry@example.invalid",
          to: "office@example.invalid",
          date: "Sun, 5 Oct 2026 20:00:00 -0300",
          body: "must not cross R2",
        }],
      }),
    },
    redact: async ({ text }) => ({ text, applied: false, redactions: 0 }),
    clock: () => "2026-10-05T23:00:00.000Z",
  });

  assert.deepEqual(runtime.connectorIds, ["peterle-mail"]);

  const response = await runtime.search({
    tenantId: "tenant-test",
    query: "documento",
    domains: ["corporate"],
  });

  assert.equal(response.results.length, 1);
  const serialized = JSON.stringify(response.results[0]);
  assert.equal(serialized.includes("must not cross R2"), false);
});
