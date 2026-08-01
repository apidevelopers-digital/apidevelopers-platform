import assert from "node:assert/strict";
import test from "node:test";

import {
  HostingerDatabaseSchemaInventoryError,
} from "../src/operator-hostinger-database-schema-policy.mjs";
import {
  createHostingerDatabaseSchemaInventoryService,
} from "../src/operator-hostinger-database-schema-inventory.mjs";

const BASE_REQUEST = Object.freeze({
  institution: "API Developers.digital",
  tenant: "uni.",
  operator: "operator-igor",
  correlationId: "corr_20260801_002",
  host: "sitedauni.com",
  logicalDatabaseId: "customer-saas",
  engine: "mysql",
  schemaOnly: true,
  includeRows: false,
  includeValues: false,
  schemas: [],
});

function createService(adapter) {
  return createHostingerDatabaseSchemaInventoryService({
    schemaAdapter: adapter,
    now: () => "2026-08-01T21:00:00.000Z",
  });
}

test("null adapter fails closed with adapter_unavailable", async () => {
  const service = createHostingerDatabaseSchemaInventoryService();

  await assert.rejects(
    service.inventory(BASE_REQUEST),
    (error) =>
      error instanceof HostingerDatabaseSchemaInventoryError &&
      error.code === "adapter_unavailable",
  );
});

test("rejects row or value access requests", async () => {
  const service = createService({
    async inspectSchema() {
      throw new Error("must not be called");
    },
  });

  for (const override of [
    { includeRows: true },
    { includeValues: true },
    { schemaOnly: false },
  ]) {
    await assert.rejects(
      service.inventory({ ...BASE_REQUEST, ...override }),
      (error) =>
        error instanceof HostingerDatabaseSchemaInventoryError &&
        ["data_access_not_allowed", "schema_only_required"].includes(error.code),
    );
  }
});

test("rejects hosts and engines outside the allowlist", async () => {
  const service = createService({
    async inspectSchema() {
      throw new Error("must not be called");
    },
  });

  await assert.rejects(
    service.inventory({ ...BASE_REQUEST, host: "example.com" }),
    (error) =>
      error instanceof HostingerDatabaseSchemaInventoryError &&
      error.code === "host_not_allowed",
  );

  await assert.rejects(
    service.inventory({ ...BASE_REQUEST, engine: "sqlite" }),
    (error) =>
      error instanceof HostingerDatabaseSchemaInventoryError &&
      error.code === "engine_not_allowed",
  );
});

test("returns deterministic schema metadata only", async () => {
  const calls = [];
  const service = createService({
    async inspectSchema(request) {
      calls.push(request);
      return {
        objects: [
          {
            kind: "table",
            schema: "public",
            name: "zeta",
            columns: [
              { name: "name", dataType: "varchar(255)", nullable: true, ordinal: 2 },
              { name: "id", dataType: "bigint", nullable: false, ordinal: 1 },
            ],
            indexes: [
              { name: "idx_zeta_name", unique: false, columns: ["name"] },
            ],
            constraints: [
              { name: "pk_zeta", type: "primary_key", columns: ["id"] },
            ],
          },
          {
            kind: "view",
            schema: "public",
            name: "alpha",
            columns: [],
            indexes: [],
            constraints: [],
          },
        ],
      };
    },
  });

  const result = await service.inventory(BASE_REQUEST);

  assert.equal(result.schemaOnly, true);
  assert.equal(result.rowsReturned, false);
  assert.equal(result.valuesReturned, false);
  assert.equal(result.productionChanged, false);
  assert.equal(result.objectCount, 2);
  assert.deepEqual(
    result.objects.map((object) => object.name),
    ["zeta", "alpha"],
   );
  assert.deepEqual(
    result.objects[0].columns.map((column) => column.name),
    ["id", "name"],
  );
  assert.deepEqual(calls, [
    {
      host: "sitedauni.com",
      logicalDatabaseId: "customer-saas",
      engine: "mysql",
      schemas: [],
      schemaOnly: true,
      includeRows: false,
      includeValues: false,
      correlationId: "corr_20260801_002",
    },
  ]);
});

test("fails closed if provider returns rows, values, SQL or credentials", async () => {
  const forbidden = [
    { rows: [] },
    { values: [] },
   { sql: "select 1" },
  { password: "redacted" },
    { connectionString: "redacted" },
  ];

  for (const extra of forbidden) {
    const service = createService({
      async inspectSchema() {
        return { objects: [], ...extra };
      },
    });

    await assert.rejects(
      service.inventory(BASE_REQUEST),
      (error) =>
        error instanceof HostingerDatabaseSchemaInventoryError &&
        error.code === "provider_returned_data",
    );
  }
});

test("validates provider schema metadata", async () => {
  const service = createService({
    async inspectSchema() {
      return {
        objects: [
          {
            kind: "table",
            schema: "public",
            name: "invalid",
            columns: [
              { name: "id", dataType: "bigint", nullable: false, ordinal: 0 },
            ],
            indexes: [],
            constraints: [],
          },
        ],
      };
    },
  });

  await assert.rejects(
    service.inventory(BASE_REQUEST),
    (error) =>
      error instanceof HostingerDatabaseSchemaInventoryError &&
      error.code === "provider_contract_violation",
  );
});
