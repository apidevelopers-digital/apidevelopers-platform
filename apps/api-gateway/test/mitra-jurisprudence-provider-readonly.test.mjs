import assert from "node:assert/strict";
import test from "node:test";

import {
  MITRA_JURISPRUDENCE_PROVIDER_ADAPTER_ID,
  createMitraJurisprudenceProviderRunner,
  createJurisprudenceReadOnlyContext,
  normalizeJurisprudenceProviderOutput,
  normalizeJurisprudenceProviderQuery,
} from "../src/mitra-jurisprudence-provider-readonly.mjs";

function identity(scopes = ["ada:mitra:read"]) {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "component.principal.ada",
      tenantId: "tenant:institution",
      scopes: Object.freeze(scopes),
    }),
  });
}

test("Mitra jurisprudence provider query normalization rejects unsafe input before provider execution", () => {
  assert.deepEqual(normalizeJurisprudenceProviderQuery({ q: "ab" }), {
    ok: false,
    error: "invalid_query",
    reason: "q_min_length_3_required",
  });
  assert.deepEqual(normalizeJurisprudenceProviderQuery({ q: "tema", periodFrom: "2026/01/01" }), {
    ok: false,
    error: "invalid_query",
    reason: "invalid_periodFrom",
  });
  assert.deepEqual(normalizeJurisprudenceProviderQuery({ q: "tema", limit: "zero" }), {
    ok: false,
    error: "invalid_query",
    reason: "invalid_limit",
  });
});

test("Mitra jurisprudence provider query normalization trims fields and caps limit", () => {
  const normalized = normalizeJurisprudenceProviderQuery({
    q: "  direito   civil ",
    tribunal: " STJ ",
    periodFrom: "2026-01-01",
    periodTo: "2026-02-01",
    limit: 99,
  });

  assert.deepEqual(normalized, {
    ok: true,
    query: {
      q: "direito civil",
      tribunal: "STJ",
      periodFrom: "2026-01-01",
      periodTo: "2026-02-01",
      limit: 10,
    },
  });
});

test("Mitra jurisprudence provider context is read-only and sanitized", () => {
  const context = createJurisprudenceReadOnlyContext(identity());

  assert.equal(context.adapterId, MITRA_JURISPRUDENCE_PROVIDER_ADAPTER_ID);
  assert.equal(context.access, "read_only");
  assert.equal(context.rawSqlAllowed, false);
  assert.equal(context.writeAllowed, false);
  assert.deepEqual(context.identity, {
    role: "service",
    principal: {
      id: "component.principal.ada",
      tenantId: "tenant:institution",
      scopes: ["ada:mitra:read"],
    },
  });
});

test("Mitra jurisprudence provider output keeps safe public fields only", () => {
  const results = normalizeJurisprudenceProviderOutput(
    {
      results: [
        {
          id: " ac-1 ",
          title: " Tema   Repetitivo ",
          source: "STJ",
          url: "https://example.test/ac-1",
          court: " STJ ",
          date: "2026-01-02",
          summary: " decisão   pública ",
          access_token: "must-not-leak",
          password: "must-not-leak",
        },
        { raw: "ignored" },
      ],
    },
    10,
  );

  assert.deepEqual(results, [
    {
      id: "ac-1",
      title: "Tema Repetitivo",
      source: "STJ",
      url: "https://example.test/ac-1",
      court: "STJ",
      date: "2026-01-02",
      summary: "decisão pública",
    },
  ]);
  assert.equal(JSON.stringify(results).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(results).includes("access_token"), false);
  assert.equal(JSON.stringify(results).includes("password"), false);
});

test("Mitra jurisprudence provider runner remains disabled by default", async () => {
  const runner = createMitraJurisprudenceProviderRunner();
  const response = await runner.search({ q: "tema" }, identity());

  assert.equal(runner.enabled, false);
  assert.deepEqual(response, {
    ok: false,
    status: 503,
    error: "dependency_unavailable",
    reason: "jurisprudence_source_not_connected",
    executionStatus: "provider_contract_ready",
    writeExecuted: false,
  });
});

test("Mitra jurisprudence provider runner uses injected mock provider with safe query and context", async () => {
  const received = [];
  const runner = createMitraJurisprudenceProviderRunner({
    provider: Object.freeze({
      async search(query, context) {
        received.push({ query, context });
        return {
          results: [
            {
              id: "r1",
              title: "Resultado público",
              source: "Mock",
              secret: "must-not-leak",
            },
          ],
        };
      },
    }),
  });

  const response = await runner.search({ q: " tema ", limit: 2 }, identity());

  assert.equal(runner.enabled, true);
  assert.equal(response.status, 200);
  assert.equal(response.executionStatus, "read_only_provider_result");
  assert.equal(response.writeExecuted, false);
  assert.equal(response.rawSqlAllowed, false);
  assert.equal(response.writeAllowed, false);
  assert.deepEqual(received[0].query, { q: "tema", limit: 2 });
  assert.equal(received[0].context.adapterId, "mitra.buscar_jurisprudencia");
  assert.equal(received[0].context.rawSqlAllowed, false);
  assert.equal(received[0].context.writeAllowed, false);
  assert.deepEqual(response.results, [{ id: "r1", title: "Resultado público", source: "Mock" }]);
});
