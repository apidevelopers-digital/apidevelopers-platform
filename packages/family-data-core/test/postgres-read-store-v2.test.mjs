import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresFamilyDataReadStore } from "../src/index.mjs";

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

function store(db) {
  return createPostgresFamilyDataReadStore({
    db,
    householdId: "hh_family",
    generatedAt: () => "2026-10-07T00:00:00.000Z"
  });
}

test("product stats preserves exact money strings without JS float conversion", async () => {
  const db = fakeDb([{ rows: [{ purchase_events: 2, units: "3.500", spend: "10.5" }] }]);
  const result = await store(db).productStats({
    tenant_id: "homosapiens-id",
    request_id: "req_stats",
    product_id: "prd_1"
  });
  assert.equal(result.data.spend, "10.50");
  assert.equal(result.data.units, "3.500");
  assert.match(db.calls[0].sql, /ROUND\(COALESCE\(SUM\(i\.line_total\),0\),2\)::text AS spend/);
});

test("purchase list is explicitly household scoped and rejects invalid limits", async () => {
  const db = fakeDb([{ rows: [] }]);
  await store(db).purchaseList({
    tenant_id: "homosapiens-id",
    request_id: "req_list",
    limit: 10
  });
  assert.deepEqual(db.calls[0].params, ["hh_family", 10]);
  assert.match(db.calls[0].sql, /household_id = \$1/);

  await assert.rejects(
    () => store(fakeDb()).purchaseList({
      tenant_id: "homosapiens-id",
      request_id: "req_bad",
      limit: -1
    }),
    /limit_invalid/
  );
});

test("evidence metadata is scoped through household purchases and storage_ref is never selected", async () => {
  const db = fakeDb([{ rows: [{ evidence_id: "ev_1", sha256: "sha256:abc" }] }]);
  const result = await store(db).evidenceGet({
    tenant_id: "homosapiens-id",
    request_id: "req_ev",
    evidence_id: "ev_1"
  });
  assert.equal(result.data.evidence.evidence_id, "ev_1");
  assert.deepEqual(db.calls[0].params, ["ev_1", "hh_family"]);
  assert.match(db.calls[0].sql, /p\.household_id = \$2/);
  assert.match(db.calls[0].sql, /p\.evidence_ids \? e\.evidence_id/);
  assert.doesNotMatch(db.calls[0].sql, /storage_ref/);
});

test("chef context product catalog is limited to products observed by the household", async () => {
  const db = fakeDb([{ rows: [] }, { rows: [] }]);
  await store(db).chefContext({
    tenant_id: "homosapiens-id",
    request_id: "req_chef",
    window_days: 30
  });
  assert.match(db.calls[0].sql, /JOIN .*purchase_items/);
  assert.match(db.calls[0].sql, /p\.household_id = \$1/);
  assert.deepEqual(db.calls[0].params, ["hh_family"]);
  assert.deepEqual(db.calls[1].params, ["hh_family", 30]);
});

test("constructor rejects unsafe schema and missing household scope", () => {
  assert.throws(
    () => createPostgresFamilyDataReadStore({
      db: fakeDb(),
      schema: "family_data;drop",
      householdId: "hh_1"
    }),
    /schema_invalid/
  );
  assert.throws(
    () => createPostgresFamilyDataReadStore({ db: fakeDb(), householdId: "" }),
    /household_id_invalid/
  );
});

test("unsafe resource ids are rejected before querying", async () => {
  const db = fakeDb();
  await assert.rejects(
    () => store(db).purchaseGet({
      tenant_id: "homosapiens-id",
      request_id: "req_bad_id",
      purchase_id: "../secret"
    }),
    /purchase_id_invalid/
  );
  assert.equal(db.calls.length, 0);
});
