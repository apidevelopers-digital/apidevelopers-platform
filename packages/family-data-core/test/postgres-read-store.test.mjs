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

function createStore(db, extra = {}) {
  return createPostgresFamilyDataReadStore({
    db,
    householdId: "hh_family_1",
    generatedAt: () => "2026-10-08T00:00:00.000Z",
    ...extra
  });
}

test("schema builder is namespaced and read model tables exist", () => {
  const sql = buildFamilyDataCoreSchemaSql({ schema: "family_data_test" }).join("\n");
  assert.match(sql, /family_data_test/);
  assert.match(sql, /purchase_items/);
  assert.match(sql, /product_aliases/);
  assert.match(sql, /purchases_fiscal_key_uq/);
});

test("postgres read store requires an explicit household scope", () => {
  const db = fakeDb();
  assert.throws(
    () => createPostgresFamilyDataReadStore({ db }),
    /householdId is required/
  );
});

test("postgres read store rejects unsafe schema identifiers", () => {
  const db = fakeDb();
  assert.throws(
    () => createPostgresFamilyDataReadStore({ db, householdId: "hh_1", schema: 'family_data";DROP' }),
    /schema identifier is invalid/
  );
});

test("postgres purchase list is parameterized and household constrained", async () => {
  const db = fakeDb([{ rows: [{ purchase_id: "pur_1", total: "10.00" }] }]);
  const store = createStore(db);
  const result = await store.purchaseList({
    tenant_id: "homosapiens-id",
    request_id: "req_1",
    date_from: "2026-01-01",
    limit: 10
  });
  assert.equal(result.data.count, 1);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /household_id = \$1/);
  assert.deepEqual(db.calls[0].params, ["hh_family_1", "2026-01-01", 10]);
});

test("postgres purchase list rejects invalid limits instead of coercing", async () => {
  const db = fakeDb();
  const store = createStore(db);
  await assert.rejects(
    () => store.purchaseList({
      tenant_id: "homosapiens-id",
      request_id: "req_limit",
      limit: -1
    }),
    /limit_invalid/
  );
  assert.equal(db.calls.length, 0);
});

test("product stats keeps money as an exact decimal string", async () => {
  const db = fakeDb([{
    rows: [{ purchase_events: 2, units: "3.500", spend: "9007199254740991.01" }]
  }]);
  const store = createStore(db);
  const result = await store.productStats({
    tenant_id: "homosapiens-id",
    request_id: "req_stats",
    product_id: "prd_1"
  });
  assert.equal(result.data.purchase_events, 2);
  assert.equal(result.data.units, "3.500");
  assert.equal(result.data.spend, "9007199254740991.01");
  assert.deepEqual(db.calls[0].params, ["prd_1", "hh_family_1"]);
});

test("postgres evidence read never selects storage_ref", async () => {
  const db = fakeDb([{ rows: [{ evidence_id: "ev_1", sha256: "sha256:abc" }] }]);
  const store = createStore(db);
  const result = await store.evidenceGet({ tenant_id: "homosapiens-id", request_id: "req_2", evidence_id: "ev_1" });
  assert.equal(result.data.evidence.evidence_id, "ev_1");
  assert.doesNotMatch(db.calls[0].sql, /storage_ref/);
  await assert.rejects(
    () => store.evidenceGet({ tenant_id: "homosapiens-id", request_id: "req_3", evidence_id: "ev_1", mode: "content" }),
    /evidence_content_forbidden/
  );
});

test("chef context SQL filters culinary products and uses explicit household scope", async () => {
  const db = fakeDb([{ rows: [] }, { rows: [] }]);
  const store = createStore(db);
  await store.chefContext({ tenant_id: "homosapiens-id", request_id: "req_4", window_days: 365 });
  assert.equal(db.calls.length, 2);
  assert.match(db.calls[0].sql, /is_food = true OR domain = 'culinary'/);
  assert.match(db.calls[1].sql, /p\.household_id = \$1/);
  assert.match(db.calls[1].sql, /is_food = true OR pr\.domain = 'culinary'/);
  assert.deepEqual(db.calls[1].params, ["hh_family_1", 365]);
  assert.doesNotMatch(db.calls[1].sql, /raw_description/);
});

test("chef context rejects invalid windows", async () => {
  const db = fakeDb();
  const store = createStore(db);
  await assert.rejects(
    () => store.chefContext({
      tenant_id: "homosapiens-id",
      request_id: "req_window",
      window_days: 0
    }),
    /window_days_invalid/
  );
  assert.equal(db.calls.length, 0);
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
