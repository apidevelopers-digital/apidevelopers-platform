import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FAMILY_DATA_POSTGRES_PROTECTED_PREFLIGHT,
  planFamilyDataPostgresProtectedPreflight,
  runFamilyDataPostgresProtectedPreflight
} from "../apps/api-gateway/src/family-data-postgres-protected-preflight.mjs";

describe("family data postgres protected preflight", () => {
  it("defaults to a dry-run plan and never performs database effects", () => {
    const plan = planFamilyDataPostgresProtectedPreflight();

    assert.equal(plan.mode, "dry_run");
    assert.equal(plan.ready, false);
    assert.equal(plan.performs_query, false);
    assert.equal(plan.acquires_client, false);
    assert.equal(plan.opens_network_connection, false);
    assert.equal(plan.reads_credentials, false);
    assert.equal(plan.mutates_database, false);
    assert.equal(plan.deploy_executed, false);
    assert.equal(plan.migration_executed, false);
    assert.equal(plan.ingestion_executed, false);
    assert.ok(plan.missing_checks.includes("preflight_enabled"));
    assert.ok(plan.missing_checks.includes("postgres_runtime_confirmed"));
  });

  it("can report dry-run readiness when non-secret gates and injected dependencies are present", () => {
    const pool = { query() {}, connect() {} };
    const authorize = () => true;

    const plan = planFamilyDataPostgresProtectedPreflight({
      env: {
        FAMILY_DATA_POSTGRES_PREFLIGHT_ENABLED: "true",
        FAMILY_DATA_POSTGRES_RUNTIME_CONFIRMED: "FAMILY_DATA_PRIVATE_POSTGRES_CONFIRMED",
        FAMILY_DATA_TENANT_ID: "homosapiens-id",
        FAMILY_DATA_HOUSEHOLD_ID: "family.grocery.bistek.v1",
        FAMILY_DATA_POSTGRES_SCHEMA: "family_data"
      },
      pool,
      authorize
    });

    assert.equal(plan.ready, true);
    assert.deepEqual(plan.missing_checks, []);
    assert.equal(plan.requires_explicit_confirmation, false);
    assert.equal(plan.performs_query, false);
    assert.equal(plan.opens_network_connection, false);
    assert.equal(plan.reads_credentials, false);
  });

  it("requires an explicit confirmation literal for live-probe mode", () => {
    const pool = { query() {}, connect() {} };
    const authorize = () => true;

    const plan = planFamilyDataPostgresProtectedPreflight({
      mode: "live_probe",
      env: {
        FAMILY_DATA_POSTGRES_PREFLIGHT_ENABLED: "true",
        FAMILY_DATA_POSTGRES_RUNTIME_CONFIRMED: "FAMILY_DATA_PRIVATE_POSTGRES_CONFIRMED",
        FAMILY_DATA_TENANT_ID: "homosapiens-id",
        FAMILY_DATA_HOUSEHOLD_ID: "family.grocery.bistek.v1",
        FAMILY_DATA_POSTGRES_SCHEMA: "family_data"
      },
      pool,
      authorize
    });

    assert.equal(plan.ready, false);
    assert.equal(plan.requires_explicit_confirmation, true);
    assert.equal(
      plan.confirmation_literal,
      FAMILY_DATA_POSTGRES_PROTECTED_PREFLIGHT.CONFIRMATION_LITERAL
    );
    assert.deepEqual(plan.missing_checks, ["live_confirmation_present"]);
  });

  it("still blocks live probes even after confirmation because operator execution is separate", async () => {
    const pool = { query() {}, connect() {} };
    const authorize = () => true;

    await assert.rejects(
      () =>
        runFamilyDataPostgresProtectedPreflight({
          mode: "live_probe",
          confirmation: FAMILY_DATA_POSTGRES_PROTECTED_PREFLIGHT.CONFIRMATION_LITERAL,
          env: {
            FAMILY_DATA_POSTGRES_PREFLIGHT_ENABLED: "true",
            FAMILY_DATA_POSTGRES_RUNTIME_CONFIRMED: "FAMILY_DATA_PRIVATE_POSTGRES_CONFIRMED",
            FAMILY_DATA_TENANT_ID: "homosapiens-id",
            FAMILY_DATA_HOUSEHOLD_ID: "family.grocery.bistek.v1",
            FAMILY_DATA_POSTGRES_SCHEMA: "family_data"
          },
          pool,
          authorize
        }),
      (error) => {
        assert.equal(error.code, "family_data_postgres_live_probe_blocked_by_operator_policy");
        assert.equal(error.plan.ready, true);
        assert.equal(error.plan.performs_query, false);
        return true;
      }
    );
  });

  it("rejects unsupported modes", () => {
    assert.throws(
      () => planFamilyDataPostgresProtectedPreflight({ mode: "unsafe" }),
      /unsupported_family_data_postgres_preflight_mode:unsafe/
    );
  });
});
