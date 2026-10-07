import { createFamilyDataEnvelope } from "./index.mjs";

function requireTenant(tenantId) {
  if (tenantId !== "homosapiens-id") {
    const error = new Error("tenant_forbidden");
    error.code = "tenant_forbidden";
    throw error;
  }
}

function assertDb(db) {
  if (!db || typeof db.query !== "function") {
    throw new TypeError("db.query is required");
  }
}

export function createPostgresFamilyDataReadStore({ db, schema = "family_data", generatedAt = () => new Date().toISOString() } = {}) {
  assertDb(db);
  const table = (name) => `"${schema}"."${name}"`;

  const envelope = (requestId, data, provenance = {}) =>
    createFamilyDataEnvelope({ requestId, data, provenance, generatedAt: generatedAt() });

  return Object.freeze({
    async purchaseList({ tenant_id, request_id, date_from = null, date_to = null, merchant_id = null, status = null, limit = 50 } = {}) {
      requireTenant(tenant_id);
      const clauses = ["household_id = $1"];
      const params = ["hh_default"];
      const push = (sql, value) => { params.push(value); clauses.push(sql.replace("?", `$${params.length}`)); };
      if (date_from) push("purchased_at >= ?", date_from);
      if (date_to) push("purchased_at <= ?", date_to);
      if (merchant_id) push("merchant_id = ?", merchant_id);
      if (status) push("status = ?", status);
      params.push(Math.min(Number(limit) || 50, 200));
      const sql = `SELECT purchase_id, purchased_at::text, merchant_id, subtotal::text, discount::text, total::text, currency, status
        FROM ${table("purchases")}
        WHERE ${clauses.join(" AND ")}
        ORDER BY purchased_at DESC, purchase_id DESC
        LIMIT $${params.length}`;
      const result = await db.query(sql, params);
      return envelope(request_id, { purchases: result.rows ?? [], count: (result.rows ?? []).length });
    },

    async purchaseGet({ tenant_id, request_id, purchase_id, include_items = true, include_payment = true, include_provenance = true } = {}) {
      requireTenant(tenant_id);
      const p = await db.query(
        `SELECT purchase_id, household_id, merchant_id, source_id, batch_id, external_order_id, fiscal_access_key,
          purchased_at::text, currency, subtotal::text, discount::text, total::text, status,
          reconciliation_status, evidence_ids
         FROM ${table("purchases")}
         WHERE household_id = $1 AND purchase_id = $2`,
        ["hh_default", purchase_id]
      );
      const purchase = p.rows?.[0] ?? null;
      if (!purchase) return envelope(request_id, { purchase: null });

      const data = { purchase };
      if (include_items) {
        const r = await db.query(
          `SELECT purchase_item_id, purchase_id, line_number, raw_description, product_id,
            quantity::text, quantity_unit, measured_weight_kg::text, unit_price::text,
            line_discount::text, line_total::text, currency
           FROM ${table("purchase_items")}
           WHERE purchase_id = $1 ORDER BY line_number NULLS LAST, purchase_item_id`,
          [purchase_id]
        );
        data.items = r.rows ?? [];
      }
      if (include_payment) {
        const r = await db.query(
          `SELECT payment_id, purchase_id, method, provider_label_raw, amount::text, currency, installments
           FROM ${table("payments")} WHERE purchase_id = $1 ORDER BY payment_id`,
          [purchase_id]
        );
        data.payments = r.rows ?? [];
      }
      return envelope(request_id, data, include_provenance ? {
        source_ids: [purchase.source_id].filter(Boolean),
        evidence_ids: Array.isArray(purchase.evidence_ids) ? purchase.evidence_ids : []
      } : {});
    },

    async productStats({ tenant_id, request_id, product_id, date_from = null, date_to = null } = {}) {
      requireTenant(tenant_id);
      const params = [product_id, "hh_default"];
      const clauses = ["i.product_id = $1", "p.household_id = $2"];
      if (date_from) { params.push(date_from); clauses.push(`p.purchased_at >= $${params.length}`); }
      if (date_to) { params.push(date_to); clauses.push(`p.purchased_at <= $${params.length}`); }
      const result = await db.query(
        `SELECT COUNT(DISTINCT i.purchase_id)::int AS purchase_events,
          COALESCE(SUM(i.quantity),0)::text AS units,
          COALESCE(SUM(i.line_total),0)::text AS spend
         FROM ${table("purchase_items")} i
         JOIN ${table("purchases")} p ON p.purchase_id = i.purchase_id
         WHERE ${clauses.join(" AND ")}`,
        params
      );
      const row = result.rows?.[0] ?? { purchase_events: 0, units: "0", spend: "0" };
      return envelope(request_id, {
        product_id,
        purchase_events: Number(row.purchase_events ?? 0),
        units: String(row.units ?? "0"),
        spend: Number(row.spend ?? 0).toFixed(2)
      });
    },

    async productPriceHistory({ tenant_id, request_id, product_id, merchant_id = null, date_from = null, date_to = null, limit = 200 } = {}) {
      requireTenant(tenant_id);
      const params = [product_id, "hh_default"];
      const clauses = ["i.product_id = $1", "p.household_id = $2"];
      if (merchant_id) { params.push(merchant_id); clauses.push(`p.merchant_id = $${params.length}`); }
      if (date_from) { params.push(date_from); clauses.push(`p.purchased_at >= $${params.length}`); }
      if (date_to) { params.push(date_to); clauses.push(`p.purchased_at <= $${params.length}`); }
      params.push(Math.min(Number(limit) || 200, 500));
      const result = await db.query(
        `SELECT p.purchase_id, p.purchased_at::text, p.merchant_id, i.purchase_item_id,
          i.unit_price::text, i.line_total::text, i.currency
         FROM ${table("purchase_items")} i
         JOIN ${table("purchases")} p ON p.purchase_id = i.purchase_id
         WHERE ${clauses.join(" AND ")}
         ORDER BY p.purchased_at, i.purchase_item_id
         LIMIT $${params.length}`,
        params
      );
      return envelope(request_id, { product_id, events: result.rows ?? [] });
    },

    async chefContext({ tenant_id, request_id, window_days = 365 } = {}) {
      requireTenant(tenant_id);
      const days = Math.max(1, Math.min(Number(window_days) || 365, 3650));
      const products = await db.query(
        `SELECT product_id, canonical_name, brand, category, package_quantity::text, package_unit, gtin
         FROM ${table("products")}
         WHERE is_food = true OR domain = 'culinary'
         ORDER BY canonical_name`,
        []
      );
      const items = await db.query(
        `SELECT i.purchase_item_id, i.purchase_id, i.product_id, i.quantity::text, i.quantity_unit,
          i.measured_weight_kg::text, i.unit_price::text, i.line_total::text, i.currency,
          p.purchased_at::text, p.merchant_id
         FROM ${table("purchase_items")} i
         JOIN ${table("products")} pr ON pr.product_id = i.product_id
         JOIN ${table("purchases")} p ON p.purchase_id = i.purchase_id
         WHERE p.household_id = $1
           AND (pr.is_food = true OR pr.domain = 'culinary')
           AND p.purchased_at >= CURRENT_DATE - ($2::int * INTERVAL '1 day')
         ORDER BY p.purchased_at DESC, i.purchase_item_id`,
        ["hh_default", days]
      );
      return envelope(request_id, { window_days: days, products: products.rows ?? [], purchase_items: items.rows ?? [] });
    },

    async evidenceGet({ tenant_id, request_id, evidence_id, mode = "metadata" } = {}) {
      requireTenant(tenant_id);
      if (mode !== "metadata") {
        const error = new Error("evidence_content_forbidden");
        error.code = "evidence_content_forbidden";
        throw error;
      }
      const r = await db.query(
        `SELECT evidence_id, batch_id, source_id, kind, sha256, captured_at::text, immutable, classification, metadata
         FROM ${table("evidence")} WHERE evidence_id = $1`,
        [evidence_id]
      );
      return envelope(request_id, { evidence: r.rows?.[0] ?? null });
    }
  });
}
