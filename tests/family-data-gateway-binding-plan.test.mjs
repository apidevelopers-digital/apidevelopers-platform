import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FAMILY_DATA_GATEWAY_BINDING_ENV,
  assertFamilyDataGatewayBindingReady,
  planFamilyDataGatewayBinding
} from "../apps/api-gateway/src/family-data-gateway-binding-plan.mjs";

describe("family data gateway binding plan", () => {
  it("is inactive by default and does not perform production effects", () => {
    const plan = planFamilyDataGatewayBinding();

    assert.equal(plan.ready, false);
    assert.equal(plan.mode, "inactive_plan");
    assert.equal(plan.performs_query, false);
    assert.equal(plan.acquires_client, false);
    assert.equal(plan.opens_network_connection, false);
    assert.equal(plan.reads_credentials, false);
    assert.equal(plan.deploy_executed, false);
    assert.equal(plan.migration_executed, false);
    assert.equal(plan.ingestion_executed, false);
    assert.ok(plan.missing_checks.includes("binding_enabled"));
    assert.ok(plan.missing_checks.includes("postgres_runtime_confirmed"));
  });

  it("requires explicit runtime confirmation before reporting ready", () => {
    const pool = { query() {}, connect() {} };
    const authorize = () => true;

    const withoutConfirmation = planFamilyDataGatewayBinding({
      env: {
        FAMILY_DATA_GATEWAY_BINDING_ENABLED: "true",
        FAMILY_DATA_HOUSEHOLD_ID: "family.grocery.bistek.v1"
      },
      pool,
      authorize
    });

    assert.equal(withoutConfirmation.ready, false);
    assert.ok(withoutConfirmation.missing_checks.includes("postgres_runtime_confirmed"));

    const ready = planFamilyDataGatewayBinding({
      env: {
        FAMILY_DATA_GATEWAY_BINDING_ENABLED: "true",
        FAMILY_DATA_POSTGRES_RUNTIME_CONFIRMED:
          FAMILY_DATA_GATEWAY_BINDING_ENV.POSTGRES_CONFIRMATION_LITERAL,
        FAMILY_DATA_HOUSEHOLD_ID: "family.grocery.bistek.v1"
      },
      pool,
      authorize
    });

    assert.equal(ready.ready, true);
    assert.deepEqual(ready.missing_checks, []);
    assert.equal(ready.opens_network_connection, false);
  });

  it("throws with a structured plan when the binding is not ready", () => {
    assert.throws(
      () => assertFamilyDataGatewayBindingReady(),
      (error) => {
        assert.equal(error.code, "family_data_gateway_binding_not_ready");
        assert.equal(error.plan.ready, false);
        assert.ok(error.plan.missing_checks.includes("binding_enabled"));
        return true;
      }
    );
  });
});
