import { createFamilyDataEnvelope } from "./index.mjs";

const moneyToNumber = (value) => Number.parseFloat(value ?? "0");
const clone = (value) => structuredClone(value);

function requireTenant(tenantId) {
  if (tenantId !== "homosapiens-id") {
    const error = new Error("tenant_forbidden");
    error.code = "tenant_forbidden";
    throw error;
  }
}

export function createInMemoryFamilyDataCore(seed = {}) {
  const purchases = clone(seed.purchases ?? []);
  const items = clone(seed.items ?? []);
  const products = clone(seed.products ?? []);
  const payments = clone(seed.payments ?? []);
  const evidence = clone(seed.evidence ?? []);
  const datasetIds = clone(seed.dataset_ids ?? ["synthetic.family.v1"]);

  function envelope(requestId, data, refs = {}) {
    return createFamilyDataEnvelope({
      requestId,
      data,
      provenance: {
        source_ids: refs.source_ids ?? [],
        evidence_ids: refs.evidence_ids ?? [],
        dataset_ids: refs.dataset_ids ?? datasetIds
      },
      generatedAt: "2026-10-07T00:00:00.000Z"
    });
  }

  return Object.freeze({
    purchaseList({ tenant_id, request_id, date_from = null, date_to = null, merchant_id = null, status = null, limit = 50 } = {}) {
      requireTenant(tenant_id);
      const rows = purchases
        .filter((p) => !date_from || p.purchased_at >= date_from)
        .filter((p) => !date_to || p.purchased_at <= date_to)
        .filter((p) => !merchant_id || p.merchant_id === merchant_id)
        .filter((p) => !status || p.status === status)
        .slice(0, limit)
        .map((p) => ({
          purchase_id: p.purchase_id,
          purchased_at: p.purchased_at,
          merchant_id: p.merchant_id,
          subtotal: p.subtotal,
          discount: p.discount,
          total: p.total,
          currency: p.currency,
          status: p.status
        }));
      return envelope(request_id, { purchases: rows, count: rows.length });
    },

    purchaseGet({ tenant_id, request_id, purchase_id, include_items = true, include_payment = true, include_provenance = true } = {}) {
      requireTenant(tenant_id);
      const purchase = purchases.find((p) => p.purchase_id === purchase_id);
      if (!purchase) return envelope(request_id, { purchase: null });
      const data = { purchase: clone(purchase) };
      if (include_items) data.items = items.filter((item) => item.purchase_id === purchase_id);
      if (include_payment) data.payments = payments.filter((payment) => payment.purchase_id === purchase_id);
      return envelope(
        request_id,
        data,
        include_provenance
          ? { source_ids: [purchase.source_id].filter(Boolean), evidence_ids: purchase.evidence_ids ?? [] }
          : {}
      );
    },

    productStats({ tenant_id, request_id, product_id, date_from = null, date_to = null } = {}) {
      requireTenant(tenant_id);
      const purchaseIds = new Set(
        purchases
          .filter((p) => !date_from || p.purchased_at >= date_from)
          .filter((p) => !date_to || p.purchased_at <= date_to)
          .map((p) => p.purchase_id)
      );
      const rows = items.filter((item) => item.product_id === product_id && purchaseIds.has(item.purchase_id));
      const events = new Set(rows.map((row) => row.purchase_id)).size;
      const units = rows.reduce((sum, row) => sum + Number.parseFloat(row.quantity ?? "0"), 0);
      const spend = rows.reduce((sum, row) => sum + moneyToNumber(row.line_total), 0);
      return envelope(request_id, {
        product_id,
        purchase_events: events,
        units: String(units),
        spend: spend.toFixed(2)
      });
    },

    productPriceHistory({ tenant_id, request_id, product_id, merchant_id = null, date_from = null, date_to = null, limit = 200 } = {}) {
      requireTenant(tenant_id);
      const purchaseById = new Map(purchases.map((p) => [p.purchase_id, p]));
      const rows = items
        .filter((item) => item.product_id === product_id)
        .map((item) => ({ item, purchase: purchaseById.get(item.purchase_id) }))
        .filter(({ purchase }) => purchase)
        .filter(({ purchase }) => !merchant_id || purchase.merchant_id === merchant_id)
        .filter(({ purchase }) => !date_from || purchase.purchased_at >= date_from)
        .filter(({ purchase }) => !date_to || purchase.purchased_at <= date_to)
        .slice(0, limit)
        .map(({ item, purchase }) => ({
          purchase_id: purchase.purchase_id,
          purchased_at: purchase.purchased_at,
          merchant_id: purchase.merchant_id,
          purchase_item_id: item.purchase_item_id,
          unit_price: item.unit_price,
          line_total: item.line_total,
          currency: item.currency
        }));
      return envelope(request_id, { product_id, events: rows });
    },

    chefContext({ tenant_id, request_id, window_days = 365 } = {}) {
      requireTenant(tenant_id);
      const foodProducts = products.filter((product) => product.domain === "culinary" || product.is_food === true);
      const allowedIds = new Set(foodProducts.map((product) => product.product_id));
      const culinaryItems = items.filter((item) => allowedIds.has(item.product_id));
      return envelope(request_id, {
        window_days,
        products: foodProducts,
        purchase_items: culinaryItems.map(({ raw_description, ...safe }) => safe)
      });
    },

    evidenceGet({ tenant_id, request_id, evidence_id, mode = "metadata" } = {}) {
      requireTenant(tenant_id);
      if (mode !== "metadata") {
        const error = new Error("evidence_content_forbidden");
        error.code = "evidence_content_forbidden";
        throw error;
      }
      const found = evidence.find((entry) => entry.evidence_id === evidence_id);
      if (!found) return envelope(request_id, { evidence: null });
      const { content, storage_ref, ...metadata } = found;
      return envelope(request_id, { evidence: metadata });
    }
  });
}
