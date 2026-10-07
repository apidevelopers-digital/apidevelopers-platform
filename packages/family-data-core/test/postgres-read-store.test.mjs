import test from "node:test";
import assert from "node:assert/strict";
import { buildFamilyDataCoreSchemaSql } from "../src/postgres-schema.mjs";
import { createPostgresFamilyDataReadStore } from "../src/postgres-read-store.mjs";
import { createFamilyDataMcpReadTools, assertFamilyDataMcpReadOnly } from "../src/mcp-read-tools.mjs";

function fakeDb(responses = []) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return responses.shift() ?? { rows: [] };
    }
  };
}

test("schema builder is namespaced and read model tables exist", () => {
  const sql = buildFamilyDataCoreSchemaSql({ schema: "family_data_test" }).join("\n");
  assert.match(sql, /family_data_test/);
  assert.match(sql, /purchase_items/);
  assert.match(sql, /product_aliases/);
  assert.match(sql, /purchases_fiscal_key_uq/);
});

test("postgres purchase list is parameterized and tenant constrained", async () => {
  const db = fakeDb([{ rows: [{ purchase_id: "pur_1", total: "10.00" }] }]);
  const store = createPostgresFamilyDataReadStore({ db, generatedAt: () => "2026-10-07T00:00:00.000Z" });
  const result = await store.purchaseList({
    tenant_id: "homosapiens-id",
    request_id: "req_1",
    date_from: "2026-01-01",
    limit: 10
  });
  assert.equal(result.data.count, 1);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /household_id = \$1/);
  assert.deepEqual(db.calls[0].params, ["hh_default", "2026-01-01", 10]);
});

test("postgres evidence read never selects storage_ref", async () => {
  const db = fakeDb([{ rows: [{ evidence_id: "ev_1", sha256: "sha256:abc" }] }]);
  const store = createPostgresFamilyDataReadStore({ db });
  const result = await store.evidenceGet({ tenant_id: "homosapiens-id", request_id: "req_2", evidence_id: "ev_1" });
  assert.equal(result.data.evidence.evidence_id, "ev_1");
  assert.doesNotMatch(db.calls[0].sql, /storage_ref/);
  await assert.rejects(
    () => store.evidenceGet({ tenant_id: "homosapiens-id", request_id: "req_3", evidence_id: "ev_1", mode: "content" }),
    /evidence_content_forbidden/
  );
});

test("chef context SQL filters culinary products and does not select raw descriptions", async () => {
  const db = fakeDb([{ rows: [] }, { rows: [] }]);
  const store = createPostgresFamilyDataReadStore({ db });
  await store.chefContext({ tenant_id: "homosapiens-id", request_id: "req_4", window_days: 365 });
  assert.equal(db.calls.length, 2);
  assert.match(db.calls[0].sql, /is_food = true OR domain = 'culinary'/);
  assert.match(db.calls[1].sql, /is_food = true OR pr.domain = 'culinary'/);
  assert.doesNotMatch(db.calls[1].sql, /raw_description/);
});

test("MCP mapping exposes read-only surface only", () => {
  const noop = async () => ({ ok: true });
  const tools = createFamilyDataMcpReadTools({
    purchaseList: noop,
    purchaseGet: noop,
    productStats: noop,
    productPriceHistory: noop,
    chefContext: noop,
    evidenceGet: noop
  });
  assert.equal(assertFamilyDataMcpReadOnly(tools), true);
  assert.deepEqual(Object.keys(tools).sort(), [
    "family.context.chef",
    "family.evidence.get",
    "family.product.price_history",
    "family.product.stats",
    "family.purchase.get",
    "family.purchase.list"
  ]);
});
