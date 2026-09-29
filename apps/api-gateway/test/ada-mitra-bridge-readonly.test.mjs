import assert from "node:assert/strict";
import test from "node:test";

import {
  adaMitraBridgeReadOnlyContract,
  createAdaMitraBridgeReadOnly,
} from "../src/ada-mitra-bridge-readonly.mjs";
import { createApp } from "../src/server.mjs";

const NOW = "2026-09-20T04:20:00.000Z";

function identity(scopes = ["ada:mitra:read"]) {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "component.principal.ada",
      tenantId: "tenant:institution",
      scopes: Object.freeze(scopes),
      status: "active",
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

const EXPECTED_LEGAL_ADAPTERS = Object.freeze([
  "mitra.buscar_jurisprudencia",
  "mitra.pesquisar_fontes_oficiais",
  "mitra.buscar_processo",
]);

const EXPECTED_LEGAL_EXECUTION_STATUS = Object.freeze({
  "mitra.buscar_jurisprudencia": "stub_unavailable",
  "mitra.pesquisar_fontes_oficiais": "contract_only",
  "mitra.buscar_processo": "contract_only",
});

test("ADA Mitra bridge contract is read-only and keeps jurisprudence route safe", () => {
  assert.equal(adaMitraBridgeReadOnlyContract.productId, "product:mitra");
  assert.equal(adaMitraBridgeReadOnlyContract.requiredScope, "ada:mitra:read");
  assert.equal(adaMitraBridgeReadOnlyContract.liveDatabaseConnected, false);
  assert.equal(adaMitraBridgeReadOnlyContract.rawSqlAllowed, false);
  assert.equal(adaMitraBridgeReadOnlyContract.writeAllowed, false);
  assert.equal(
    adaMitraBridgeReadOnlyContract.routes.buscarJurisprudencia,
    "/v1/ada/mitra/legal/jurisprudencia",
  );
  assert.deepEqual(
    adaMitraBridgeReadOnlyContract.legalReadOnlyAdapters.map((adapter) => adapter.id),
    EXPECTED_LEGAL_ADAPTERS,
  );
  for (const adapter of adaMitraBridgeReadOnlyContract.legalReadOnlyAdapters) {
    assert.equal(adapter.access, "read_only");
    assert.equal(adapter.executionStatus, EXPECTED_LEGAL_EXECUTION_STATUS[adapter.id]);
    assert.equal(adapter.externalConnectionEnabled, false);
    assert.equal(adapter.credentialsRequired, false);
    assert.equal(adapter.writeAllowed, false);
    assert.equal(adapter.rawSqlAllowed, false);
  }
  assert.equal(
    adaMitraBridgeReadOnlyContract.previewRuntimeSha,
    "64fe412b75962f6a0f07c1423cd0b6f11dd64540",
  );
});

test("ADA Mitra bridge status requires authentication and read scope", async () => {
  const noAuthBridge = createAdaMitraBridgeReadOnly();
  const unavailable = await noAuthBridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/status",
  });
  assert.equal(unavailable.status, 503);
  assert.equal(JSON.parse(unavailable.body).error, "authentication_unavailable");

  const unauthorizedBridge = createAdaMitraBridgeReadOnly({
    authenticator: authenticator(null),
  });
  const unauthorized = await unauthorizedBridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/status",
  });
  assert.equal(unauthorized.status, 401);

  const forbiddenBridge = createAdaMitraBridgeReadOnly({
    authenticator: authenticator(identity(["other:scope"])),
  });
  const forbidden = await forbiddenBridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/status",
  });
  assert.equal(forbidden.status, 403);
  assert.equal(JSON.parse(forbidden.body).requiredScope, "ada:mitra:read");
});

test("ADA Mitra bridge exposes read-only status, capabilities and connector inventory", async () => {
  const bridge = createAdaMitraBridgeReadOnly({
    authenticator: authenticator(),
    now: () => NOW,
  });

  const status = await bridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/status",
  });
  assert.equal(status.status, 200);
  const statusBody = JSON.parse(status.body);
  assert.equal(statusBody.ok, true);
  assert.equal(statusBody.service, "ada-mitra-bridge");
  assert.equal(statusBody.productId, "product:mitra");
  assert.equal(statusBody.generatedAt, NOW);
  assert.equal(statusBody.preview.loginConfirmed, true);
  assert.equal(statusBody.dataAccess.liveDatabaseConnected, false);
  assert.equal(statusBody.dataAccess.databaseCredentialsConfigured, false);
  assert.equal(statusBody.dataAccess.rawSqlAllowed, false);
  assert.equal(statusBody.dataAccess.writeAllowed, false);
  assert.equal(statusBody.safety.readOnly, true);
  assert.equal(statusBody.safety.dryRunEnabled, false);
  assert.equal(statusBody.safety.executeEnabled, false);
  assert.equal(statusBody.safety.secretsExposed, false);

  const capabilities = await bridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/capabilities",
  });
  assert.equal(capabilities.status, 200);
  const capabilitiesBody = JSON.parse(capabilities.body);
  assert.deepEqual(
    capabilitiesBody.capabilities.map((item) => item.id),
    [
      "mitra.status",
      "mitra.capabilities",
      "mitra.connectors",
      ...EXPECTED_LEGAL_ADAPTERS,
    ],
  );
  assert.deepEqual(
    capabilitiesBody.capabilities
      .filter((item) => EXPECTED_LEGAL_ADAPTERS.includes(item.id))
      .map((item) => ({
        id: item.id,
        path: item.path,
        access: item.access,
        executionStatus: item.executionStatus,
        externalConnectionEnabled: item.externalConnectionEnabled,
        credentialsRequired: item.credentialsRequired,
        writeAllowed: item.writeAllowed,
        rawSqlAllowed: item.rawSqlAllowed,
      })),
    [
      {
        id: "mitra.buscar_jurisprudencia",
        path: "/v1/ada/mitra/legal/jurisprudencia",
        access: "read_only",
        executionStatus: "stub_unavailable",
        externalConnectionEnabled: false,
        credentialsRequired: false,
        writeAllowed: false,
        rawSqlAllowed: false,
      },
      {
        id: "mitra.pesquisar_fontes_oficiais",
        path: null,
        access: "read_only",
        executionStatus: "contract_only",
        externalConnectionEnabled: false,
        credentialsRequired: false,
        writeAllowed: false,
        rawSqlAllowed: false,
      },
      {
        id: "mitra.buscar_processo",
        path: null,
        access: "read_only",
        executionStatus: "contract_only",
        externalConnectionEnabled: false,
        credentialsRequired: false,
        writeAllowed: false,
        rawSqlAllowed: false,
      },
    ],
  );
  assert.ok(capabilitiesBody.unavailableUntilApproved.includes("raw_sql"));
  assert.ok(capabilitiesBody.unavailableUntilApproved.includes("external_lex_mitra_execution"));

  const connectors = await bridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/connectors",
  });
  assert.equal(connectors.status, 200);
  const connectorsBody = JSON.parse(connectors.body);
  assert.equal(connectorsBody.connectorCount, 3);
  assert.deepEqual(
    connectorsBody.connectors.map((connector) => connector.id),
    EXPECTED_LEGAL_ADAPTERS,
  );
  assert.equal(connectorsBody.liveDatabaseConnected, false);
  assert.equal(connectorsBody.credentialsConfigured, false);
  assert.equal(connectorsBody.externalConnectionEnabled, false);
  assert.equal(connectorsBody.rawSqlAllowed, false);
  assert.equal(connectorsBody.writeAllowed, false);
});

test("ADA Mitra jurisprudence provider wiring remains disabled by default", async () => {
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
  assert.equal(body.service, "ada-mitra-bridge");
  assert.equal(body.adapterId, "mitra.buscar_jurisprudencia");
  assert.equal(body.error, "dependency_unavailable");
  assert.equal(body.reason, "jurisprudence_source_not_connected");
  assert.equal(body.executionStatus, "stub_unavailable");
  assert.equal(body.access, "read_only");
  assert.equal(body.readOnly, true);
  assert.equal(body.writeExecuted, false);
  assert.equal(body.externalConnectionEnabled, false);
  assert.equal(body.liveDatabaseConnected, false);
  assert.equal(body.credentialsRequired, false);
  assert.equal(body.rawSqlAllowed, false);
  assert.equal(body.writeAllowed, false);
  assert.equal(body.secretsExposed, false);
});

test("ADA Mitra jurisprudence provider wiring validates input before provider execution", async () => {
  let calls = 0;
  const bridge = createAdaMitraBridgeReadOnly({
    authenticator: authenticator(),
    now: () => NOW,
    jurisprudenceProvider: Object.freeze({
      async search() {
        calls += 1;
        return { results: [] };
      },
    }),
  });

  const response = await bridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/legal/jurisprudencia?q=ab&periodFrom=2026/01/01",
  });

  assert.equal(response.status, 400);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.equal(body.error, "invalid_query");
  assert.equal(body.writeExecuted, false);
  assert.equal(calls, 0);
});

test("ADA Mitra jurisprudence provider wiring uses injected mock provider with safe output", async () => {
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
              id: " r1 ",
              title: " Resultado   público ",
              source: "Mock",
              url: "https://example.test/r1",
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
    url: "/v1/ada/mitra/legal/jurisprudencia?q= tema &tribunal= STJ &limit=2",
  });

  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.service, "ada-mitra-bridge");
  assert.equal(body.adapterId, "mitra.buscar_jurisprudencia");
  assert.equal(body.status, "ready");
  assert.equal(body.executionStatus, "read_only_provider_result");
  assert.equal(body.externalConnectionEnabled, false);
  assert.equal(body.liveDatabaseConnected, false);
  assert.equal(body.credentialsRequired, false);
  assert.equal(body.rawSqlAllowed, false);
  assert.equal(body.writeAllowed, false);
  assert.equal(body.writeExecuted, false);
  assert.deepEqual(received[0].query, { q: "tema", tribunal: "STJ", limit: 2 });
  assert.equal(received[0].context.adapterId, "mitra.buscar_jurisprudencia");
  assert.equal(received[0].context.rawSqlAllowed, false);
  assert.equal(received[0].context.writeAllowed, false);
  assert.deepEqual(body.results, [
    {
      id: "r1",
      title: "Resultado público",
      source: "Mock",
      url: "https://example.test/r1",
      court: "STJ",
      date: "2026-01-02",
      summary: "decisão pública",
    },
  ]);
  const serialized = JSON.stringify(body).toLowerCase();
  assert.equal(serialized.includes("must-not-leak"), false);
  assert.equal(serialized.includes("access_token"), false);
  assert.equal(serialized.includes("password"), false);
});

test("ADA Mitra jurisprudencie route rejects unauthenticated, insufficient scope and write methods", async () => {
  const noAuthBridge = createAdaMitraBridgeReadOnly();
  const unavailable = await noAuthBridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/legal/jurisprudencia",
  });
  assert.equal(unavailable.status, 503);
  assert.equal(JSON.parse(unavailable.body).error, "authentication_unavailable");

  const forbiddenBridge = createAdaMitraBridgeReadOnly({
    authenticator: authenticator(identity(["other:scope"])),
  });
  const forbidden = await forbiddenBridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/legal/jurisprudencia",
  });
  assert.equal(forbidden.status, 403);
  assert.equal(JSON.parse(forbidden.body).writeExecuted, false);

  const bridge = createAdaMitraBridgeReadOnly({
    authenticator: authenticator(),
    now: () => NOW,
  });
  const write = await bridge.handleRequest({
    method: "POST",
    url: "/v1/ada/mitra/legal/jurisprudencia",
    body: JSON.stringify({ token: "never" }),
  });
  assert.equal(write.status, 405);
  assert.equal(JSON.parse(write.body).writeExecuted, false);
});

test("ADA Mitra bridge rejects writes and avoids secret-like payload fields", async () => {
  const bridge = createAdaMitraBridgeReadOnly({
    authenticator: authenticator(),
    now: () => NOW,
  });

  const write = await bridge.handleRequest({
    method: "POST",
    url: "/v1/ada/mitra/status",
    body: JSON.stringify({ token: "never" }),
  });
  assert.equal(write.status, 405);
  assert.equal(JSON.parse(write.body).writeExecuted, false);

  const response = await bridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/status",
    headers: {
      authorization: "Bearer secret",
      cookie: "session=secret",
    },
  });
  const serialized = response.body.toLowerCase();
  assert.equal(serialized.includes("bearer secret"), false);
  assert.equal(serialized.includes("session=secret"), false);
  assert.equal(serialized.includes("password"), false);
  assert.equal(serialized.includes("access_token"), false);
});

test("server composes ADA Mitra read-only bridge when provided", async () => {
  const bridge = createAdaMitraBridgeReadOnly({
    authenticator: authenticator(),
    now: () => NOW,
  });
  const app = createApp({ adaMitraBridge: bridge });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/status",
  });

  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).service, "ada-mitra-bridge");
});
