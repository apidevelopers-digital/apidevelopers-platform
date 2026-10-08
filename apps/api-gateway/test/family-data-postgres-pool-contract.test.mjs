import assert from "node:assert/strict";
import test from "node:test";

import {
  createFamilyDataPostgresQueryAdapter,
  preflightFamilyDataPostgresPool
} from "../src/family-data-postgres-pool-contract.mjs";

function postgresLikePool() {
  const calls = [];
  return {
    calls,
    async query(text, params) {
      calls.push({ text, params });
      return { rows: [] };
    },
    async connect() {
      throw new Error("connect must not be called by contract preflight");
    }
  };
}

test("PostgreSQL pool preflight is side-effect free", () => {
  const pool = postgresLikePool();

  const result = preflightFamilyDataPostgresPool({
    pool,
    householdId: "hh_family_1"
  });

  assert.equal(result.ready, true);
  assert.equal(result.source, "external_runtime_postgres_pool");
  assert.equal(result.performs_query, false);
  assert.equal(result.acquires_client, false);
  assert.equal(result.opens_network_connection, false);
  assert.equal(result.reads_credentials, false);
  assert.equal(result.deploy_executed, false);
  assert.equal(pool.calls.length, 0);
});

test("preflight fails closed for incomplete pool contract", () => {
  const result = preflightFamilyDataPostgresPool({
    pool: { async query() { return { rows: [] }; } },
    householdId: "hh_family_1"
  });

  assert.equal(result.ready, false);
  assert.equal(result.checks.pool_connect_present, false);
});

test("preflight fails closed for missing household", () => {
  const result = preflightFamilyDataPostgresPool({
    pool: postgresLikePool()
  });

  assert.equal(result.ready, false);
  assert.equal(result.checks.household_configured, false);
});

test("preflight rejects unsupported tenant", () => {
  const result = preflightFamilyDataPostgresPool({
    pool: postgresLikePool(),
    householdId: "hh_family_1",
    tenantId: "other-tenant"
  });

  assert.equal(result.ready, false);
  assert.equal(result.checks.tenant_supported, false);
});

test("query adapter forwards only explicit queries to the injected pool", async () => {
  const pool = postgresLikePool();
  const adapter = createFamilyDataPostgresQueryAdapter({
    pool,
    householdId: " hh_family_1 "
  });

  assert.equal(adapter.kind, "family_data_postgres_query_adapter");
  assert.equal(adapter.source, "external_runtime_postgres_pool");
  assert.equal(adapter.tenantId, "homosapiens-id");
  assert.equal(adapter.householdId, "hh_family_1");
  assert.equal(pool.calls.length, 0);

  await adapter.query("SELECT $1::text AS value", ["ok"]);

  assert.deepEqual(pool.calls, [{
    text: "SELECT $1::text AS value",
    params: ["ok"]
  }]);
});

test("adapter refuses an incomplete pool contract", () => {
  assert.throws(
    () => createFamilyDataPostgresQueryAdapter({
      pool: { async query() { return { rows: [] }; } },
      householdId: "hh_family_1"
    }),
    /pool_connect_present/
  );
});
