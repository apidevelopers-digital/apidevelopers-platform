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

test("ADA Mitra bridge contract is read-only and does not expose SQL or writes", () => {
  assert.equal(adaMitraBridgeReadOnlyContract.productId, "product:mitra");
  assert.equal(adaMitraBridgeReadOnlyContract.requiredScope, "ada:mitra:read");
  assert.equal(adaMitraBridgeReadOnlyContract.liveDatabaseConnected, false);
  assert.equal(adaMitraBridgeReadOnlyContract.rawSqlAllowed, false);
  assert.equal(adaMitraBridgeReadOnlyContract.writeAllowed, false);
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
    capabilitiesBody.capabilities.map((item) => item.path),
    [
      "/v1/ada/mitra/status",
      "/v1/ada/mitra/capabilities",
      "/v1/ada/mitra/connectors",
    ],
  );
  assert.ok(capabilitiesBody.unavailableUntilApproved.includes("raw_sql"));

  const connectors = await bridge.handleRequest({
    method: "GET",
    url: "/v1/ada/mitra/connectors",
  });
  assert.equal(connectors.status, 200);
  const connectorsBody = JSON.parse(connectors.body);
  assert.equal(connectorsBody.connectorCount, 0);
  assert.deepEqual(connectorsBody.connectors, []);
  assert.equal(connectorsBody.liveDatabaseConnected, false);
  assert.equal(connectorsBody.credentialsConfigured, false);
  assert.equal(connectorsBody.rawSqlAllowed, false);
  assert.equal(connectorsBody.writeAllowed, false);
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
