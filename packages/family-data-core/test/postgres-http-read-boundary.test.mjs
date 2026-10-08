import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresFamilyDataHttpReadBoundary } from "../src/postgres-http-read-boundary.mjs";

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

const allow = async () => true;

test("postgres HTTP boundary requires explicit authorization callback", () => {
  const db = fakeDb();
  assert.throws(
    () => createPostgresFamilyDataHttpReadBoundary({ db, householdId: "hh_1" }),
    /authorize callback is required/
  );
});

test("authorized purchase list stays household scoped end to end", async () => {
  const db = fakeDb([{ rows: [{ purchase_id: "pur_1", total: "10.00" }] }]);
  const handle = createPostgresFamilyDataHttpReadBoundary({
    db,
    householdId: "hh_family_1",
    authorize: allow,
    generatedAt: () => "2026-10-08T00:00:00.000Z",
    requestId: () => "req_http_1"
  });

  const response = await handle({
    method: "GET",
    path: "/v1/family/purchases",
    query: { limit: "10" },
    headers: { "x-tenant-id": "homosapiens-id" }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.count, 1);
  assert.match(db.calls[0].sql, /household_id = \$1/);
  assert.deepEqual(db.calls[0].params, ["hh_family_1", 10]);
});

test("wrong tenant is rejected before database access", async () => {
  const db = fakeDb();
  const handle = createPostgresFamilyDataHttpReadBoundary({
    db,
    householdId: "hh_family_1",
    authorize: allow
  });

  const response = await handle({
    method: "GET",
    path: "/v1/family/purchases",
    headers: { "x-tenant-id": "other" }
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "tenant_forbidden");
  assert.equal(db.calls.length, 0);
});

test("evidence metadata is household scoped and never selects storage_ref", async () => {
  const db = fakeDb([{ rows: [{ evidence_id: "ev_1", sha256: "sha256:abc" }] }]);
  const handle = createPostgresFamilyDataHttpReadBoundary({
    db,
    householdId: "hh_family_1",
    authorize: allow,
    requestId: () => "req_ev"
  });

  const response = await handle({
    method: "GET",
    path: "/v1/family/evidence/ev_1",
    query: { mode: "metadata" }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.evidence.evidence_id, "ev_1");
  assert.match(db.calls[0].sql, /p\.household_id = \$2/);
  assert.match(db.calls[0].sql, /p\.evidence_ids \? e\.evidence_id/);
  assert.doesNotMatch(db.calls[0].sql, /storage_ref/);
  assert.deepEqual(db.calls[0].params, ["ev_1", "hh_family_1"]);
});

test("Chef catalog returns only products linked to the scoped household", async () => {
  const db = fakeDb([{ rows: [] }, { rows: [] }]);
  const handle = createPostgresFamilyDataHttpReadBoundary({
    db,
    householdId: "hh_family_1",
    authorize: allow,
    requestId: () => "req_chef"
  });

  const response = await handle({
    method: "GET",
    path: "/v1/family/context/chef",
    query: { window_days: "30" }
  });

  assert.equal(response.status, 200);
  assert.match(db.calls[0].sql, /EXISTS/);
  assert.match(db.calls[0].sql, /pp\.household_id = \$1/);
  assert.deepEqual(db.calls[0].params, ["hh_family_1"]);
  assert.deepEqual(db.calls[1].params, ["hh_family_1", 30]);
});

test("deny-by-scope prevents database access", async () => {
  const db = fakeDb();
  const handle = createPostgresFamilyDataHttpReadBoundary({
    db,
    householdId: "hh_family_1",
    authorize: async () => false
  });

  const response = await handle({
    method: "GET",
    path: "/v1/family/products/prd_1/stats"
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "scope_forbidden");
  assert.equal(db.calls.length, 0);
});
