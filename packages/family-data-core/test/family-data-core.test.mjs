import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryFamilyDataCore, familyDataCapabilities } from "../src/index.mjs";

const seed = {
  dataset_ids: ["synthetic.family.v1"],
  purchases: [
    {
      purchase_id: "pur_1",
      merchant_id: "mer_bistek",
      source_id: "src_bistek",
      purchased_at: "2026-01-10",
      currency: "BRL",
      subtotal: "20.00",
      discount: "0.00",
      total: "20.00",
      status: "paid",
      evidence_ids: ["ev_1"]
    },
    {
      purchase_id: "pur_2",
      merchant_id: "mer_bistek",
      source_id: "src_bistek",
      purchased_at: "2026-02-10",
      currency: "BRL",
      subtotal: "10.00",
      discount: "0.00",
      total: "10.00",
      status: "paid",
      evidence_ids: ["ev_2"]
    }
  ],
  products: [
    { product_id: "prd_food", canonical_name: "Produto culinário", domain: "culinary", is_food: true },
    { product_id: "prd_private", canonical_name: "Produto não culinário", domain: "household", is_food: false }
  ],
  items: [
    { purchase_item_id: "item_1", purchase_id: "pur_1", product_id: "prd_food", raw_description: "RAW FOOD", quantity: "2", unit_price: "5.00", line_total: "10.00", currency: "BRL" },
    { purchase_item_id: "item_2", purchase_id: "pur_1", product_id: "prd_private", raw_description: "RAW PRIVATE", quantity: "1", unit_price: "10.00", line_total: "10.00", currency: "BRL" },
    { purchase_item_id: "item_3", purchase_id: "pur_2", product_id: "prd_food", raw_description: "RAW FOOD", quantity: "2", unit_price: "5.00", line_total: "10.00", currency: "BRL" }
  ],
  payments: [
    { payment_id: "pay_1", purchase_id: "pur_1", method: "credit_card", amount: "20.00", currency: "BRL" }
  ],
  evidence: [
    { evidence_id: "ev_1", kind: "screenshot", sha256: "sha256:abc", immutable: true, content: "SECRET", storage_ref: "opaque://hidden" }
  ]
};

const core = createInMemoryFamilyDataCore(seed);
const tenant_id = "homosapiens-id";

test("exposes only read capabilities", () => {
  assert.deepEqual(familyDataCapabilities.write, []);
  assert.ok(familyDataCapabilities.read.includes("family.context.chef"));
});

test("lists purchases with canonical envelope", () => {
  const result = core.purchaseList({ tenant_id, request_id: "req_1", date_from: "2026-01-01", date_to: "2026-01-31" });
  assert.equal(result.schema_version, "family-data-core.v1");
  assert.equal(result.tenant_id, tenant_id);
  assert.equal(result.data.count, 1);
  assert.equal(result.data.purchases[0].purchase_id, "pur_1");
});

test("returns purchase items and payment by id", () => {
  const result = core.purchaseGet({ tenant_id, request_id: "req_2", purchase_id: "pur_1" });
  assert.equal(result.data.items.length, 2);
  assert.equal(result.data.payments.length, 1);
  assert.deepEqual(result.provenance.evidence_ids, ["ev_1"]);
});

test("computes product stats from source rows", () => {
  const result = core.productStats({ tenant_id, request_id: "req_3", product_id: "prd_food" });
  assert.equal(result.data.purchase_events, 2);
  assert.equal(result.data.units, "4");
  assert.equal(result.data.spend, "20.00");
});

test("returns price history", () => {
  const result = core.productPriceHistory({ tenant_id, request_id: "req_4", product_id: "prd_food" });
  assert.equal(result.data.events.length, 2);
  assert.equal(result.data.events[0].unit_price, "5.00");
});

test("chef projection excludes non-culinary product and raw descriptions", () => {
  const result = core.chefContext({ tenant_id, request_id: "req_5" });
  assert.deepEqual(result.data.products.map((p) => p.product_id), ["prd_food"]);
  assert.equal(result.data.purchase_items.length, 2);
  assert.equal("raw_description" in result.data.purchase_items[0], false);
});

test("evidence access returns metadata only", () => {
  const result = core.evidenceGet({ tenant_id, request_id: "req_6", evidence_id: "ev_1" });
  assert.equal(result.data.evidence.evidence_id, "ev_1");
  assert.equal("content" in result.data.evidence, false);
  assert.equal("storage_ref" in result.data.evidence, false);
  assert.throws(
    () => core.evidenceGet({ tenant_id, request_id: "req_7", evidence_id: "ev_1", mode: "content" }),
    /evidence_content_forbidden/
  );
});

test("rejects wrong tenant", () => {
  assert.throws(
    () => core.purchaseList({ tenant_id: "other-tenant", request_id: "req_8" }),
    /tenant_forbidden/
  );
});
