import assert from "node:assert/strict";
import test from "node:test";

import {
  composeFamilyDataOperationalDependencies,
  preflightFamilyDataOperationalDependencies
} from "../src/family-data-read-operational-preflight.mjs";

function operationalGateway() {
  return {
    authenticator: {
      async authenticate() {
        return { principal: { tenantId: "homosapiens-id", scopes: [] } };
      }
    }
  };
}

test("preflight is side-effect free and reports all missing dependencies", () => {
  const result = preflightFamilyDataOperationalDependencies();

  assert.equal(result.ready, false);
  assert.equal(result.performs_db_query, false);
  assert.equal(result.opens_network_connection, false);
  assert.equal(result.reads_secrets, false);
  assert.equal(result.deploy_executed, false);
  assert.deepEqual(result.checks, {
    operational_gateway_present: false,
    authenticator_present: false,
    db_query_present: false,
    household_configured: false,
    tenant_supported: true
  });
});

test("operational authenticator plus injected db query adapter can pass preflight without querying", () => {
  let queryCalls = 0;
  const db = {
    async query() {
      queryCalls += 1;
      return { rows: [] };
    }
  };

  const result = preflightFamilyDataOperationalDependencies({
    gateway: operationalGateway(),
    db,
    householdId: "hh_family_1"
  });

  assert.equal(result.ready, true);
  assert.equal(result.authenticator_source, "operational_gateway.authenticator");
  assert.equal(result.db_source, "external_injected_query_adapter");
  assert.equal(queryCalls, 0);
});

test("unsupported tenant fails closed", () => {
  const result = prefligightFamilyDataOperationalDependencies({
    gateway: operationalGateway(),
    db: { async query() { return { rows: [] }; } },
    householdId: "hh_family_1",
    tenantId: "other-tenant"
  });

  assert.equal(result.ready, false);
  assert.equal(result.checks.tenant_supported, false);
});

test("composition returns only the required operational dependencies", () => {
  const gateway = operationalGateway();
  const db = { async query() { return { rows: [] }; } };

  const result = composeFamilyDataOperationalDependencies({
    gateway,
    db,
    householdId: " hh_family_1 "
  });

  assert.equal(result.tenantId, "homosapiens-id");
  assert.equal(result.householdId, "hh_family_1");
  assert.equal(result.authenticator, gateway.authenticator);
  assert.equal(result.db, db);
});

test("composition refuses incomplete dependencies", () => {
  assert.throws(
    () => composeFamilyDataOperationalDependencies({
      gateway: operationalGateway(),
      householdId: "hh_family_1"
    }),
    /db_query_present/
  );
});
