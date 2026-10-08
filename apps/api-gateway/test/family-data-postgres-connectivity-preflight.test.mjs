import assert from "node:assert/strict";
import test from "node:test";

import {
  FAMILY_DATA_CONNECTIVITY_PROBE_CONFIRMATION,
  planFamilyDataPostgresConnectivity,
  probeFamilyDataPostgresConnectivity
} from "../src/family-data-postgres-connectivity-preflight.mjs";

function mockPool() {
  const calls = [];
  return {
    calls,
    async query() {
      throw new Error("pool.query must not be used by connectivity preflight");
    },
    async connect() {
      calls.push(["connect"]);
      return {
        async query(sql) {
          calls.push(["client.query", sql]);
          return {
            rows: [{ family_data_connectivity_probe: 1 }]
          };
        },
        release() {
          calls.push(["release"]);
        }
      };
    }
  };
}

test("connectivity plan is side-effect free and pins managed hosting runtime owner", () => {
  const pool = mockPool();

  const result = planFamilyDataPostgresConnectivity({
    pool,
    householdId: "hh_family_1"
  });

  assert.equal(result.ready, true);
  assert.equal(result.runtime_owner, "hostinger_managed_hosting_git_runtime");
  assert.equal(result.connectivity_executed, false);
  assert.equal(result.query_executed, false);
  assert.equal(result.deploy_executed, false);
  assert.equal(result.credentials_exposed, false);
  assert.equal(pool.calls.length, 0);
});

test("probe defaults to dry-run and never connects", async () => {
  const pool = mockPool();

  const result = await probeFamilyDataPostgresConnectivity({
    pool,
    householdId: "hh_family_1"
  });

  assert.equal(result.status, "dry_run");
  assert.equal(result.connectivity_executed, false);
  assert.equal(pool.calls.length, 0);
});

test("real probe refuses execution without explicit confirmation", async () => {
  const pool = mockPool();

  await assert.rejects(
    () => probeFamilyDataPostgresConnectivity({
      pool,
      householdId: "hh_family_1",
      execute: true
    }),
    /explicit connectivity probe confirmation/
  );

  assert.equal(pool.calls.length, 0);
});

test("confirmed probe acquires one client, executes SELECT 1 and releases it", async () => {
  const pool = mockPool();

  const result = await probeFamilyDataPostgresConnectivity({
    pool,
    householdId: "hh_family_1",
    execute: true,
    confirmation: FAMILY_DATA_CONNECTIVITY_PROBE_CONFIRMATION
  });

  assert.equal(result.status, "success");
  assert.equal(result.connectivity_executed, true);
  assert.equal(result.query_executed, true);
  assert.deepEqual(pool.calls, [
    ["connect"],
    ["client.query", "SELECT 1 AS family_data_connectivity_probe"],
    ["release"]
  ]);
});

test("unsupported tenant is rejected before any connection", async () => {
  const pool = mockPool();

  await assert.rejects(
    () => probeFamilyDataPostgresConnectivity({
      pool,
      householdId: "hh_family_1",
      tenantId: "other-tenant",
      execute: true,
      confirmation: FAMILY_DATA_CONNECTIVITY_PROBE_CONFIRMATION
    }),
    /tenant_supported/
  );

  assert.equal(pool.calls.length, 0);
});
