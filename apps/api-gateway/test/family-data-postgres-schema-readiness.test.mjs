import assert from "node:assert/strict";
import test from "node:test";

import {
  FAMILY_DATA_REQUIRED_POSTGRES_TABLES,
  FAMILY_DATA_SCHEMA_READINESS_PROBE_CONFIRMATION,
  planFamilyDataPostgresSchemaReadiness,
  probeFamilyDataPostgresSchemaReadiness
} from "../src/family-data-postgres-schema-readiness.mjs";

function mockPool({ schemaExists = true, tables = FAMILY_DATA_REQUIRED_POSTGRES_TABLES } = {}) {
  const calls = [];
  return {
    calls,
    async query() {
      throw new Error("pool.query must not be used by schema readiness probe");
    },
    async connect() {
      calls.push(["connect"]);
      return {
        async query(sql, params) {
          calls.push(["client.query", sql, params]);
          if (sql.includes("information_schema.schemata")) {
            return { rows: [{ schema_exists: schemaExists }] };
          }
          if (sql.includes("information_schema.tables")) {
            return { rows: tables.map((table_name) => ({ table_name })) };
          }
          throw new Error("unexpected query");
        },
        release() {
          calls.push(["release"]);
        }
      };
    }
  };
}

test("schema readiness plan is side-effect free and pins the canonical six tables", () => {
  const pool = mockPool();
  const result = planFamilyDataPostgresSchemaReadiness({
    pool,
    householdId: "hh_family_1"
  });

  assert.equal(result.ready, true);
  assert.equal(result.schema, "family_data");
  assert.deepEqual(result.required_tables, [
    "evidence",
    "payments",
    "product_aliases",
    "products",
    "purchase_items",
    "purchases"
  ]);
  assert.equal(result.schema_catalog_read_executed, false);
  assert.equal(result.data_rows_read, false);
  assert.equal(result.schema_mutated, false);
  assert.equal(result.deploy_executed, false);
  assert.equal(pool.calls.length, 0);
});

test("probe defaults to dry-run and never connects", async () => {
  const pool = mockPool();
  const result = await probeFamilyDataPostgresSchemaReadiness({
    pool,
    householdId: "hh_family_1"
  });

  assert.equal(result.status, "dry_run");
  assert.equal(result.schema_exists, null);
  assert.equal(result.schema_catalog_read_executed, false);
  assert.equal(pool.calls.length, 0);
});

test("real schema probe refuses execution without explicit confirmation", async () => {
  const pool = mockPool();

  await assert.rejects(
    () => probeFamilyDataPostgresSchemaReadiness({
      pool,
      householdId: "hh_family_1",
      execute: true
    }),
    /explicit schema readiness probe confirmation/
  );

  assert.equal(pool.calls.length, 0);
});

test("confirmed probe reads only schema catalog and reports ready", async () => {
  const pool = mockPool();

  const result = await probeFamilyDataPostgresSchemaReadiness({
    pool,
    householdId: "hh_family_1",
    execute: true,
    confirmation: FAMILY_DATA_SCHEMA_READINESS_PROBE_CONFIRMATION
  });

  assert.equal(result.status, "ready");
  assert.equal(result.schema_exists, true);
  assert.deepEqual(result.missing_tables, []);
  assert.equal(result.schema_catalog_read_executed, true);
  assert.equal(result.data_rows_read, false);
  assert.equal(result.schema_mutated, false);
  assert.equal(result.credentials_exposed, false);
  assert.equal(pool.calls[0][0], "connect");
  assert.match(pool.calls[1][1], /information_schema\.schemata/);
  assert.match(pool.calls[2][1], /information_schema\.tables/);
  assert.equal(pool.calls.at(-1)[0], "release");
});

test("confirmed probe reports missing tables without mutating schema", async () => {
  const pool = mockPool({
    tables: ["evidence", "products", "purchases"]
  });

  const result = await probeFamilyDataPostgresSchemaReadiness({
    pool,
    householdId: "hh_family_1",
    execute: true,
    confirmation: FAMILY_DATA_SCHEMA_READINESS_PROBE_CONFIRMATION
  });

  assert.equal(result.status, "not_ready");
  assert.deepEqual(result.present_tables, ["evidence", "products", "purchases"]);
  assert.deepEqual(result.missing_tables, [
    "payments",
    "product_aliases",
    "purchase_items"
  ]);
  assert.equal(result.schema_mutated, false);
});

test("missing schema does not query tables", async () => {
  const pool = mockPool({ schemaExists: false, tables: [] });

  const result = await probeFamilyDataPostgresSchemaReadiness({
    pool,
    householdId: "hh_family_1",
    execute: true,
    confirmation: FAMILY_DATA_SCHEMA_READINESS_PROBE_CONFIRMATION
  });

  assert.equal(result.status, "not_ready");
  assert.equal(result.schema_exists, false);
  assert.deepEqual(result.present_tables, []);
  assert.deepEqual(result.missing_tables, [...FAMILY_DATA_REQUIRED_POSTGRES_TABLES]);
  assert.equal(
    pool.calls.filter((call) => call[0] === "client.query").length,
    1
  );
});

test("unsafe schema identifiers are rejected before any connection", async () => {
  const pool = mockPool();

  await assert.rejects(
    () => probeFamilyDataPostgresSchemaReadiness({
      pool,
      householdId: "hh_family_1",
      schema: "family_data;drop schema public",
      execute: true,
      confirmation: FAMILY_DATA_SCHEMA_READINESS_PROBE_CONFIRMATION
    }),
    /schema identifier is invalid/
  );

  assert.equal(pool.calls.length, 0);
});
