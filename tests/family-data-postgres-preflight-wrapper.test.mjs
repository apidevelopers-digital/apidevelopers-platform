import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FAMILY_DATA_POSTGRES_PREFLIGHT_ROUTE,
  attachFamilyDataPostgresProtectedPreflightToGateway,
  createFamilyDataPostgresProtectedPreflightHttpApp
} from "../apps/api-gateway/src/family-data-postgres-preflight-wrapper.mjs";

async function readJson(response) {
  if (typeof response?.json === "function") {
    return response.json();
  }
  return JSON.parse(response.body);
}

describe("family data postgres protected preflight wrapper", () => {
  it("returns dry-run metadata without calling the downstream app", async () => {
    let downstreamCalled = false;
    const app = {
      async handleRequest() {
        downstreamCalled = true;
        return new Response("downstream", { status: 418 });
      }
    };

    const http = createFamilyDataPostgresProtectedPreflightHttpApp({
      app,
      env: {}
    });

    const response = await http.app.handleRequest(
      new Request(`https://gateway.test${FAMILY_DATA_POSTGRES_PREFLIGHT_ROUTE}`)
    );
    const body = await readJson(response);

    assert.equal(downstreamCalled, false);
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.route, FAMILY_DATA_POSTGRES_PREFLIGHT_ROUTE);
    assert.equal(body.mode, "dry_run");
    assert.equal(body.family_data_postgres_preflight.mode, "dry_run");
    assert.equal(body.family_data_postgres_preflight.performs_query, false);
    assert.equal(body.family_data_postgres_preflight.opens_network_connection, false);
    assert.equal(body.family_data_postgres_preflight.reads_credentials, false);
    assert.ok(body.family_data_postgres_preflight.missing_checks.includes("preflight_enabled"));
  });

  it("accepts live-probe planning metadata while still performing no database effects", async () => {
    const pool = { query() {}, connect() {} };
    const authorize = () => true;
    const app = {
      async handleRequest() {
        return new Response("downstream", { status: 418 });
      }
    };

    const http = createFamilyDataPostgresProtectedPreflightHttpApp({
      app,
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

    const response = await http.app.handleRequest(
      new Request(
        `https://gateway.test${FAMILY_DATA_POSTGRES_PREFLIGHT_ROUTE}?mode=live_probe&confirmation=FAMILY_DATA_PRIVATE_POSTGRES_PREFLIGHT_APPROVED`
      )
    );
    const body = await readJson(response);

    assert.equal(body.mode, "live_probe");
    assert.equal(body.family_data_postgres_preflight.ready, true);
    assert.equal(body.family_data_postgres_preflight.requires_explicit_confirmation, true);
    assert.equal(body.family_data_postgres_preflight.performs_query, false);
    assert.equal(body.family_data_postgres_preflight.acquires_client, false);
    assert.equal(body.family_data_postgres_preflight.mutates_database, false);
  });

  it("delegates unrelated requests to the existing gateway app", async () => {
    const app = {
      async handleRequest(request) {
        return new Response(`delegated:${new URL(request.url).pathname}`, {
          status: 203
        });
      }
    };

    const http = createFamilyDataPostgresProtectedPreflightHttpApp({
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

  it("attaches the metadata route to a gateway object", () => {
    const gateway = {
      app: {
        async handleRequest() {
          return new Response("ok", { status: 200 });
        }
      },
      familyDataPostgresPool: { query() {}, connect() {} },
      familyDataAuthorize() {
        return true;
      }
    };

    const attached = attachFamilyDataPostgresProtectedPreflightToGateway({
      gateway,
      env: {}
    });

    assert.equal(typeof attached.app.handleRequest, "function");
    assert.equal(attached.familyDataPostgresPreflight.route, FAMILY_DATA_POSTGRES_PREFLIGHT_ROUTE);
    assert.equal(attached.familyDataPostgresPreflight.performs_query, false);
    assert.equal(attached.familyDataPostgresPreflight.opens_network_connection, false);
    assert.equal(attached.familyDataPostgresPreflight.deploy_executed, false);
  });
});
