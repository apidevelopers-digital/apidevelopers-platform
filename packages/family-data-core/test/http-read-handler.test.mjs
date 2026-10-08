import test from "node:test";
import assert from "node:assert/strict";
import { createFamilyDataHttpReadHandler } from "../src/http-read-handler.mjs";

function envelope(data) {
  return { schema_version: "family-data-core.v1", request_id: "req", tenant_id: "homosapiens-id", data, provenance: {} };
}

function fakeStore() {
  return {
    async purchaseList(args) { return envelope({ purchases: [], args }); },
    async purchaseGet(args) { return envelope({ purchase: args.purchase_id === "missing" ? null : { purchase_id: args.purchase_id } }); },
    async productStats(args) { return envelope({ product_id: args.product_id, spend: "12.30" }); },
    async productPriceHistory(args) { return envelope({ product_id: args.product_id, events: [], args }); },
    async chefContext(args) { return envelope({ window_days: args.window_days, products: [], purchase_items: [] }); },
    async evidenceGet(args) { return envelope({ evidence: args.evidence_id === "missing" ? null : { evidence_id: args.evidence_id } }); }
  };
}

const allow = async () => true;

test("denies by default without authorize callback", async () => {
  const handle = createFamilyDataHttpReadHandler({ store: fakeStore() });
  const res = await handle({ method: "GET", path: "/v1/family/purchases" });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "scope_forbidden");
});

test("routes purchase list with bounded integer limit", async () => {
  const handle = createFamilyDataHttpReadHandler({ store: fakeStore(), authorize: allow, requestId: () => "req_1" });
  const res = await handle({ method: "GET", path: "/v1/family/purchases", query: { limit: "25" } });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.args.limit, 25);
});

test("blocks unsupported query injection fields", async () => {
  const handle = createFamilyDataHttpReadHandler({ store: fakeStore(), authorize: allow });
  const res = await handle({ method: "GET", path: "/v1/family/purchases", query: { url: "https://evil.invalid" } });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "query_not_supported");
});

test("blocks wrong tenant", async () => {
  const handle = createFamilyDataHttpReadHandler({ store: fakeStore(), authorize: allow });
  const res = await handle({ method: "GET", path: "/v1/family/purchases", headers: { "x-tenant-id": "other" } });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "tenant_forbidden");
});

test("blocks evidence content mode and permits metadata", async () => {
  const handle = createFamilyDataHttpReadHandler({ store: fakeStore(), authorize: allow });
  const denied = await handle({ method: "GET", path: "/v1/family/evidence/ev_1", query: { mode: "content" } });
  assert.equal(denied.status, 403);
  const allowed = await handle({ method: "GET", path: "/v1/family/evidence/ev_1", query: { mode: "metadata" } });
  assert.equal(allowed.status, 200);
});

test("returns 404 for missing purchase and rejects non-GET", async () => {
  const handle = createFamilyDataHttpReadHandler({ store: fakeStore(), authorize: allow });
  const missing = await handle({ method: "GET", path: "/v1/family/purchases/missing" });
  assert.equal(missing.status, 404);
  const post = await handle({ method: "POST", path: "/v1/family/purchases" });
  assert.equal(post.status, 405);
});

test("parses chef window_days and boolean purchase flags", async () => {
  const handle = createFamilyDataHttpReadHandler({ store: fakeStore(), authorize: allow });
  const chef = await handle({ method: "GET", path: "/v1/family/context/chef", query: { window_days: "30" } });
  assert.equal(chef.status, 200);
  assert.equal(chef.body.data.window_days, 30);
  const purchase = await handle({ method: "GET", path: "/v1/family/purchases/p_1", query: { include_items: "false" } });
  assert.equal(purchase.status, 200);
});
