import assert from "node:assert/strict";
import test from "node:test";

import {
  createFamilyDataReadActivation,
  planFamilyDataReadActivation,
  startFamilyDataReadActivation
} from "../src/family-data-read-activation.mjs";

function enabledEnv(overrides = {}) {
  return {
    FAMILY_DATA_READ_ENABLED: "true",
    FAMILY_DATA_HOUSEHOLD_ID: "hh_family_1",
    ...overrides
  };
}

function dbWith(rows = []) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows };
    }
  };
}

function authenticatorFor({ tenantId = "homosapiens-id", scopes = [] } = {}) {
  const calls = [];
  return {
    calls,
    async authenticate(headers) {
      calls.push(headers);
      return {
        role: "service",
        principal: {
          id: "family-data-test",
          tenantId,
          scopes
        }
      };
    }
  };
}

test("activation plan is disabled and side-effect free by default", () => {
  assert.deepEqual(planFamilyDataReadActivation({ env: {} }), {
    enabled: false,
    tenant_id: "homosapiens-id",
    household_configured: false,
    schema: "family_data",
    requires_db: false,
    requires_authenticator: false,
    requires_household: false,
    deploy_executed: false,
    database_connected: false,
    api_storage_accessed: false,
    ingestion_executed: false
  });
});

test("enabled activation fails closed without household, db or authenticator", () => {
  assert.throws(
    () => createFamilyDataReadActivation({
      env: { FAMILY_DATA_READ_ENABLED: "true" }
    }),
    /FAMILY_DATA_HOUSEHOLD_ID/
  );

  assert.throws(
    () => createFamilyDataReadActivation({
      env: enabledEnv()
    }),
    /db.query/
  );

  assert.throws(
    () => createFamilyDataReadActivation({
      env: enabledEnv(),
      db: dbWith()
    }),
    /authenticator.authenticate/
  );
});

test("authorized identity reaches household-scoped PostgreSQL read boundary", async () => {
  const db = dbWith([{ purchase_id: "pur_1", total: "10.00" }]);
  const authenticator = authenticatorFor({
    scopes: ["family:purchases:read"]
  });
  const activation = createFamilyDataReadActivation({
    env: enabledEnv(),
    db,
    authenticator,
    generatedAt: () => "2026-10-08T00:00:00.000Z",
    requestId: () => "req_1"
  });

  assert.equal(activation.enabled, true);
  assert.equal(activation.binding.status().enabled, true);

  const response = await activation.binding.handleRequest({
    method: "GET",
    url: "/v1/family/purchases?limit=10",
    headers: {
      "x-tenant-id": "homosapiens-id",
      "x-api-key": "not-inspected-by-family-data"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(authenticator.calls.length, 1);
  assert.match(db.calls[0].sql, /household_id = \$1/);
  assert.deepEqual(db.calls[0].params, ["hh_family_1", 10]);
});

test("missing Family Data scope is denied before database access", async () => {
  const db = dbWith();
  const activation = createFamilyDataReadActivation({
    env: enabledEnv(),
    db,
    authenticator: authenticatorFor({ scopes: ["operator:resource:read"] })
  });

  const response = await activation.binding.handleRequest({
    method: "GET",
    url: "/v1/family/products/prd_1/stats"
  });

  assert.equal(response.status, 403);
  assert.equal(db.calls.length, 0);
});

test("tenant mismatch is denied before database access", async () => {
  const db = dbWith();
  const activation = createFamilyDataReadActivation({
    env: enabledEnv(),
    db,
    authenticator: authenticatorFor({
      tenantId: "other-tenant",
      scopes: ["family:purchases:read"]
    })
  });

  const response = await activation.binding.handleRequest({
    method: "GET",
    url: "/v1/family/purchases"
  });

  assert.equal(response.status, 403);
  assert.equal(db.calls.length, 0);
});

test("runtime activation delegates canonical start while disabled", async () => {
  const calls = [];
  const server = { kind: "canonical" };

  const result = await startFamilyDataReadActivation({
    env: {},
    port: 3400,
    host: "127.0.0.1",
    startBase: async (options) => {
      calls.push(options);
      return server;
    }
  });

  assert.equal(result, server);
  assert.deepEqual(calls, [{ port: 3400, host: "127.0.0.1" }]);
});

test("invalid enable flag is rejected explicitly", () => {
  assert.throws(
    () => planFamilyDataReadActivation({
      env: { FAMILY_DATA_READ_ENABLED: "yes" }
    }),
    /FAMILY_DATA_READ_ENABLED/
  );
});
