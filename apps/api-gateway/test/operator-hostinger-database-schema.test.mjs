import assert from "node:assert/strict";
import test from "node:test";

import {
  HostingerDatabaseSchemaInventoryError,
} from "../src/operator-hostinger-database-schema-policy.mjs";
import {
  createHostingerDatabaseSchemaInventoryService,
} from "../src/operator-hostinger-database-schema-inventory.mjs";
import {
  createHostingerDatabaseSchemaInventoryHttpApp,
} from "../src/operator-hostinger-database-schema-http.mjs";

const REQUEST = Object.freeze({
  institution: "API Developers.digital",
  tenant: "uni.",
  operator: "operator-igor",
  correlationId: "corr_20260801_schema",
  host: "sitedauni.com",
  logicalDatabaseId: "customer-saas",
  engine: "mysql",
  schemaOnly: true,
  includeRows: false,
  includeValues: false,
  schemas: [],
});

test("service rejects rows, values and unsupported engines before adapter access", async () => {
  let calls = 0;
  const service = createHostingerDatabaseSchemaInventoryService({
    schemaAdapter: {
      async inspectSchema() {
        calls += 1;
        return { objects: [] };
      },
    },
  });

  for (const override of [
    { includeRows: true },
    { includeValues: true },
    { schemaOnly: false },
    { engine: "sqlite" },
  ]) {
    await assert.rejects(
      service.inventory({ ...REQUEST, ...override }),
      (error) => error instanceof HostingerDatabaseSchemaInventoryError,
    );
  }
  assert.equal(calls, 0);
});

test("service returns only sanitized schema metadata", async () => {
  const service = createHostingerDatabaseSchemaInventoryService({
    schemaAdapter: {
      async inspectSchema(input) {
        assert.equal(input.includeRows, false);
        assert.equal(input.includeValues, false);
        return {
          objects: [{
            kind: "table",
            schema: "public",
            name: "customers",
            columns: [{ name: "id", dataType: "bigint", nullable: false, ordinal: 1 }],
            indexes: [],
            constraints: [{ name: "pk_customers", type: "primary_key", columns: ["id"] }],
          }],
        };
      },
    },
    now: () => "2026-08-01T21:30:00.000Z",
  });

  const result = await service.inventory(REQUEST);
  assert.equal(result.objectCount, 1);
  assert.equal(result.schemaOnly, true);
  assert.equal(result.rowsReturned, false);
  assert.equal(result.valuesReturned, false);
  assert.equal(result.productionChanged, false);
});

test("service fails closed when provider returns data-bearing fields", async () => {
  const service = createHostingerDatabaseSchemaInventoryService({
    schemaAdapter: {
      async inspectSchema() {
        return { objects: [], rows: [] };
      },
    },
  });

  await assert.rejects(
    service.inventory(REQUEST),
    (error) =>
      error instanceof HostingerDatabaseSchemaInventoryError &&
      error.code === "provider_returned_data",
  );
});

function httpFixture({ identity, scopes, inventoryImpl } = {}) {
  const calls = { inventory: 0, audit: [] };
  const principal = identity === null
    ? null
    : {
        role: "operator",
        principal: {
          id: "operator-igor",
          tenantId: "uni.",
          scopes: scopes ?? ["operator:hostinger:database:schema:read"],
        },
      };

  const app = createHostingerDatabaseSchemaInventoryHttpApp({
    app: { async handleRequest() { return { status: 404, headers: {}, body: "{}" }; } },
    authenticator: { async authenticate() { return principal; } },
    authorization: {
      decide({ identity: current, requiredScopes }) {
        const allowed = requiredScopes.every(
          (scope) => current.principal.scopes.includes(scope),
        );
        return {
          decisionId: "decision-schema",
          effect: allowed ? "allow" : "deny",
          policyVersion: "gateway-authz-v1",
        };
      },
    },
    inventory: {
      async inventory(input) {
        calls.inventory += 1;
        if (inventoryImpl) return inventoryImpl(input);
        throw new HostingerDatabaseSchemaInventoryError(
          "adapter_unavailable",
          "adapter unavailable",
        );
      },
    },
    audit: {
      async recordOperatorCapabilityResult(event) {
        calls.audit.push(event);
        return { eventId: "audit-schema" };
      },
    },
  });

  return { app, calls };
}

async function post(app, body = REQUEST) {
  return app.handleRequest({
    method: "POST",
    url: "/v1/operator/hostinger/database/schema/inventory",
    headers: {},
    body: JSON.stringify({
      correlationId: body.correlationId,
      host: body.host,
      logicalDatabaseId: body.logicalDatabaseId,
      engine: body.engine,
      schemaOnly: body.schemaOnly,
      includeRows: body.includeRows,
      includeValues: body.includeValues,
      schemas: body.schemas,
    }),
  });
}

test("HTTP route enforces authentication and scope", async () => {
  const unauthenticated = httpFixture({ identity: null });
  assert.equal((await post(unauthenticated.app)).status, 401);
  assert.equal(unauthenticated.calls.inventory, 0);

  const denied = httpFixture({ scopes: [] });
  assert.equal((await post(denied.app)).status, 403);
  assert.equal(denied.calls.inventory, 0);
  assert.equal(denied.calls.audit[0].outcome, "denied");
});

test("HTTP route uses null adapter semantics and sanitized audit metadata", async () => {
  const fixture = httpFixture();
  const response = await post(fixture.app);
  const payload = JSON.parse(response.body);

  assert.equal(response.status, 503);
  assert.equal(payload.error, "adapter_unavailable");
  assert.equal(payload.rowsReturned, false);
  assert.equal(payload.valuesReturned, false);
  assert.equal(payload.productionChanged, false);
  assert.equal(fixture.calls.audit[0].outcome, "failure");
  assert.equal("schemas" in fixture.calls.audit[0].metadata, false);
});
