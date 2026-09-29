import assert from "node:assert/strict";
import test from "node:test";

import { createAdaMitraBridgeReadOnly } from "../src/ada-mitra-bridge-readonly.mjs";

const NOW = "2026-09-29T12:00:00.000Z";

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

function authenticator(value = identity()) {
  return Object.freeze({
    async authenticate() {
      return value;
    },
  });
}

test("ADA Mitra jurisprudence route keeps dependency_unavailable without injected provider", async () => {
  const bridge = createAdaMitraBridgeReadOnly({
    authenticator: authenticator(),
    now: () => NOW,
  });

  const response = await bridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/legal/jurisprudencia?q=tema",
  });

  assert.equal(response.status, 503);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.equal(body.adapterId, "mitra.buscar_jurisprudencia");
  assert.equal(body.error, "dependency_unavailable");
  assert.equal(body.reason, "jurisprudence_source_not_connected");
  assert.equal(body.executionStatus, "stub_unavailable");
  assert.equal(body.writeExecuted, false);
  assert.equal(body.rawSqlAllowed, false);
  assert.equal(body.writeAllowed, false);
  assert.equal(body.secretsExposed, false);
});

test("ADA Mitra jurisprudence route rejects invalid query before injected provider execution", async () => {
  let providerCalls = 0;
  const bridge = createAdaMitraBridgeReadOnly({
    authenticator: authenticator(),
    now: () => NOW,
    jurisprudenceProvider: Object.freeze({
      async search() {
        providerCalls += 1;
        return { results: [] };
      },
    }),
  });

  const response = await bridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/legal/jurisprudencia?q=ab",
  });

  assert.equal(providerCalls, 0);
  assert.equal(response.status, 400);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.equal(body.error, "invalid_query");
  assert.equal(body.reason, "q_min_length_3_required");
  assert.equal(body.writeExecuted, false);
});

test("ADA Mitra jurisprudence route uses injected mock provider with sanitized read-only envelope", async () => {
  const received = [];
  const bridge = createAdaMitraBridgeReadOnly({
    authenticator: authenticator(),
    now: () => NOW,
    jurisprudenceProvider: Object.freeze({
      async search(query, context) {
        received.push({ query, context });
        return {
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
          ],
        };
      },
    }),
  });

  const response = await bridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/legal/jurisprudencia?q= direito   civil &tribunal= STJ &periodFrom=2026-01-01&periodTo=2026-02-01&limit=99",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(received[0].query, {
    q: "direito civil",
    tribunal: "STJ",
    periodFrom: "2026-01-01",
    periodTo: "2026-02-01",
    limit: 10,
  });
  assert.equal(received[0].context.adapterId, "mitra.buscar_jurisprudencia");
  assert.equal(received[0].context.access, "read_only");
  assert.equal(received[0].context.rawSqlAllowed, false);
  assert.equal(received[0].context.writeAllowed, false);

  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.adapterId, "mitra.buscar_jurisprudencia");
  assert.equal(body.executionStatus, "read_only_provider_result");
  assert.equal(body.writeExecuted, false);
  assert.equal(body.rawSqlAllowed, false);
  assert.equal(body.writeAllowed, false);
  assert.equal(body.secretsExposed, false);
  assert.deepEqual(body.query, {
    q: "direito civil",
    tribunal: "STJ",
    periodFrom: "2026-01-01",
    periodTo: "2026-02-01",
    limit: 10,
  });
  assert.deepEqual(body.results, [
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
  assert.equal(response.body.includes("must-not-leak"), false);
  assert.equal(response.body.includes("access_token"), false);
  assert.equal(response.body.includes("password"), false);
});

test("ADA Mitra jurisprudence route keeps auth, scope and write protections with provider wiring", async () => {
  const bridge = createAdaMitraBridgeReadOnly({
    authenticator: authenticator(identity(["other:scope"])),
    now: () => NOW,
    jurisprudenceProvider: Object.freeze({
      async search() {
        return { results: [] };
      },
    }),
  });

  const forbidden = await bridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/legal/jurisprudencia?q=tema",
  });
  assert.equal(forbidden.status, 403);
  assert.equal(JSON.parse(forbidden.body).writeExecuted, false);

  const authorizedBridge = createAdaMitraBridgeReadOnly({
    authenticator: authenticator(),
    now: () => NOW,
    jurisprudenceProvider: Object.freeze({
      async search() {
        return { results: [] };
      },
    }),
  });

  const write = await authorizedBridge.handleRequest({
    method: "POST",
    url: "/v1/ada/mitra/legal/jurisprudencia?q=tema",
    body: JSON.stringify({ rawSql: "never" }),
  });
  assert.equal(write.status, 405);
  assert.equal(JSON.parse(write.body).writeExecuted, false);
});
