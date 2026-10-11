import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FAMILY_DATA_GATEWAY_READINESS_ROUTE,
  attachFamilyDataGatewayReadinessToGateway,
  createFamilyDataGatewayReadinessHttpApp
} from "../apps/api-gateway/src/family-data-gateway-readiness-wrapper.mjs";

async function readJson(response) {
  if (typeof response?.json === "function") {
    return response.json();
  }
  return JSON.parse(response.body);
}

describe("family data gateway readiness wrapper", () => {
  it("returns readiness metadata without calling the downstream app", async () => {
    let downstreamCalled = false;
    const app = {
      async handleRequest() {
        downstreamCalled = true;
        return new Response("downstream", { status: 418 });
      }
    };

    const http = createFamilyDataGatewayReadinessHttpApp({
      app,
      env: {}
    });

    const response = await http.app.handleRequest(
      new Request(`https://gateway.test${FAMILY_DATA_GATEWAY_READINESS_ROUTE}`)
    );
    const body = await readJson(response);

    assert.equal(downstreamCalled, false);
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.route, FAMILY_DATA_GATEWAY_READINESS_ROUTE);
    assert.equal(body.family_data_gateway_binding.ready, false);
    assert.equal(body.family_data_gateway_binding.performs_query, false);
    assert.equal(body.family_data_gateway_binding.opens_network_connection, false);
    assert.equal(body.family_data_gateway_binding.reads_credentials, false);
    assert.ok(body.family_data_gateway_binding.missing_checks.includes("binding_enabled"));
  });

  it("delegates unrelated requests to the existing gateway app", async () => {
    const app = {
      async handleRequest(request) {
        return new Response(`delegated:${new URL(request.url).pathname}`, {
          status: 203
        });
      }
    };

    const http = createFamilyDataGatewayReadinessHttpApp({
      app,
      env: {}
    });

    const response = await http.app.handleRequest(
      new Request("https://gateway.test/health")
    );
    const text = await response.text();

    assert.equal(response.status, 203);
    assert.equal(text, "delegated:/health");
  });

  it("attaches the readiness route to a gateway without enabling production effects", () => {
    const gateway = {
      app: {
        async handleRequest() {
          return new Response("ok", { status: 200 });
        }
      },
      familyDataPostgresPool: {
        query() {},
        connect() {}
      },
      familyDataAuthorize() {
        return true;
      }
    };

    const attached = attachFamilyDataGatewayReadinessToGateway({
      gateway,
      env: {
        FAMILY_DATA_GATEWAY_BINDING_ENABLED: "true",
        FAMILY_DATA_POSTGRES_RUNTIME_CONFIRMED:
          "FAMILY_DATA_PRIVATE_POSTGRES_CONFIRMED",
        FAMILY_DATA_HOUSEHOLD_ID: "family.grocery.bistek.v1"
      }
    });

    assert.equal(typeof attached.app.handleRequest, "function");
    assert.equal(attached.familyDataGatewayReadiness.route, FAMILY_DATA_GATEWAY_READINESS_ROUTE);
    assert.equal(attached.familyDataGatewayReadiness.performs_query, false);
    assert.equal(attached.familyDataGatewayReadiness.opens_network_connection, false);
    assert.equal(attached.familyDataGatewayReadiness.deploy_executed, false);
  });
});
