import test from "node:test";
import assert from "node:assert/strict";
import { buildFamilyDataCoreSchemaSql } from "../src/postgres-schema.mjs";

test("schema builder generates namespaced SQL with the canonical identifier", () => {
  const statements = buildFamilyDataCoreSchemaSql({ schema: "family_data_v1" });
  assert.equal(statements.length, 9);
  assert.equal(statements[0], 'CREATE SCHEMA IF NOT EXISTS "family_data_v1"');
  assert.match(statements.join("\n"), /"family_data_v1"\."purchases"/);
  assert.match(statements.join("\n"), /"family_data_v1"\."product_aliases"/);
  assert.match(statements.join("\n"), /CREATE UNIQUE INDEX IF NOT EXISTS purchases_fiscal_key_uq/);
});

test("schema builder preserves the existing default namespace", () => {
  const statements = buildFamilyDataCoreSchemaSql();
  assert.equal(statements[0], 'CREATE SCHEMA IF NOT EXISTS "family_data"');
});

test("schema builder rejects unsafe, truncated, and non-string identifiers before SQL generation", () => {
  const invalidSchemas = [
    "",
    " ",
    "family-data",
    'family_data"; DROP SCHEMA public; --',
    "family_data\nCREATE TABLE unsafe",
    "9family_data",
    "f".repeat(64),
    null,
    12,
    {},
    ["family_data"]
  ];
  for (const schema of invalidSchemas) {
    assert.throws(
      () => buildFamilyDataCoreSchemaSql({ schema }),
      { name: "TypeError", message: "schema identifier is invalid" },
      `schema: ${String(schema)}`
    );
  }
});

test("schema builder accepts the longest nontruncating PostgreSQL identifier", () => {
  const schema = "s".repeat(63);
  const sql = buildFamilyDataCoreSchemaSql({ schema });
  assert.equal(sql[0], `CREATE SCHEMA IF NOT EXISTS "${schema}"`);
});
