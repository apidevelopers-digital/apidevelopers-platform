import { createFamilyDataEnvelope } from "./contract.mjs";

const TENANT_ID = "homosapiens-id";
const SAFE_SCHEMA = /^[a-z_][a-z0-9_]*$/;
const SAFE_SCOPE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const DECIMAL = /^-?\d+(?:\.\d+)?$/;

function fail(code, Type = Error) {
  const error = new Type(code);
  error.code = code;
  throw error;
}

function requireTenant(tenantId) {
  if (tenantId !== TENANT_ID) fail("tenant_forbidden");
}

function assertDb(db) {
  if (!db || typeof db.query !== "function") {
    throw new TypeError("db.query is required");
  }
}

function validateSchema(schema) {
  if (!SAFE_SCHEMA.test(String(schema ?? ""))) fail("schema_invalid", TypeError);
  return schema;
}

function validateScopeId(value, field) {
  if (!SAFE_SCOPE_ID.test(String(value ?? ""))) fail(`${field}_invalid`, TypeError);
  return value;
}

function boundedInteger(value, fallback, max, field) {
  const candidate = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > max) {
    fail(`${field}_invalid`, RangeError);
  }
  return candidate;
}

function exactMoney(value) {
  const text = String(value ?? "0").trim();
  if (!DECIMAL.test(text)) fail("money_value_invalid", TypeError);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > 2) fail("money_scale_invalid", TypeError);
  return `${negative ? "-" : ""}${whole}.${fraction.padEnd(2, "0")}`;
}

export function createPostgresFamilyDataReadStore({
  db,
  schema = "family_data",
  householdId,
  generatedAt = () => new Date().toISOString()
} = {}) {
  assertDb(db);
  const safeSchema = validateSchema(schema);
  const scopedHouseholdId = validateScopeId(householdId, "household_id");
  const table = (name) => `"${safeSchema}"."${name}"`;
  const envelope = (requestId, data, provenance = {}) =>
    createFamilyDataEnvelope({
      requestId,
      data,
      provenance,
      generatedAt: generatedAt()
    });

  return Object.freeze({
    async purchaseList({
      tenant_id,
      request_id,
      date_from = null,
      date_to = null,
      merchant_id = null,
      status = null,
      limit = 50
    } = {}) {
      requireTenant(tenant_id);
      const boundedLimit = boundedInteger(limit, 50, 200, "limit");
      const clauses = ["household_id = $1"];
      const params = [scopedHouseholdId];
      const push = (sql, value) => {
        params.push(value);
        clauses.push(sql.replace("?", `$${params.length}`));
      };
      if (date_from) push("purchased_at >= ?", date_from);
      if (date_to) push("purchased_at <= ?", date_to);
      if (merchant_id) push("merchant_id = ?", merchant_id);
      if (status) push("status = ?", status);
      params.push(boundedLimit);

      const result = await db.query(
        `SELECT purchase_id, purchased_at::text, merchant_id,
                subtotal::text, discount::text, total::text, currency, status
           FROM ${table("purchases")}
          WHERE ${clauses.join(" AND ")}
          ORDER BY purchased_at DESC, purchase_id DESC
          LIMIT $${params.length}`,
        params
      );
      const rows = result.rows ?? [];
      return envelope(request_id, { purchases: rows, count: rows.length });
    },

    async purchaseGet({
      tenant_id,
      request_id,
      purchase_id,
      include_items = true,
      include_payment = true,
      include_provenance = true
    } = {}) {
      requireTenant(tenant_id);
      validateScopeId(purchase_id, "purchase_id");
      const p = await db.query(
        `SELECT purchase_id, household_id, merchant_id, source_id, batch_id,
                external_order_id, fiscal_access_key, purchased_at::text, currency,
                subtotal::text, discount::text, total::text, status,
                reconciliation_status, evidence_ids
           FROM ${table("purchases")}
          WHERE household_id = $1 AND purchase_id = $2`,
        [scopedHouseholdId, purchase_id]
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
            WHERE purchase_id = $1
            ORDER BY line_number NULLS LAST, purchase_item_id`,
          [purchase_id]
        );
        data.items = r.rows ?? [];
      }
      if (include_payment) {
        const r = await db.query(
          `SELECT payment_id, purchase_id, method, provider_label_raw,
                  amount::text, currency, installments
             FROM ${table("payments")}
            WHERE purchase_id = $1
            ORDER BY payment_id`,
          [purchase_id]
        );
        data.payments = r.rows ?? [];
      }

      return envelope(
        request_id,
        data,
        include_provenance
          ? {
              source_ids: [purchase.source_id].filter(Boolean),
              evidence_ids: Array.isArray(purchase.evidence_ids) ? purchase.evidence_ids : []
            }
          : {}
      );
    },

    async productStats({
      tenant_id,
      request_id,
      product_id,
      date_from = null,
      date_to = null
    } = {}) {
      requireTenant(tenant_id);
      validateScopeId(product_id, "product_id");
      const params = [product_id, scopedHouseholdId];
      const clauses = ["i.product_id = $1", "p.household_id = $2"];
      if (date_from) {
        params.push(date_from);
        clauses.push(`p.purchased_at >= $${params.length}`);
      }
      if (date_to) {
        params.push(date_to);
        clauses.push(`p.purchased_at <= $${params.length}`);
      }

      const result = await db.query(
        `SELECT COUNT(DISTINCT i.purchase_id)::int AS purchase_events,
                COALESCE(SUM(i.quantity),0)::text AS units,
                ROUND(COALESCE(SUM(i.line_total),0),2)::text AS spend
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
        spend: exactMoney(row.spend)
      });
    },

    async productPriceHistory({
      tenant_id,
      request_id,
      product_id,
      merchant_id = null,
      date_from = null,
      date_to = null,
      limit = 200
    } = {}) {
      requireTenant(tenant_id);
      validateScopeId(product_id, "product_id");
      const boundedLimit = boundedInteger(limit, 200, 500, "limit");
      const params = [product_id, scopedHouseholdId];
      const clauses = ["i.product_id = $1", "p.household_id = $2"];
      if (merchant_id) {
        params.push(merchant_id);
        clauses.push(`p.merchant_id = $${params.length}`);
      }
      if (date_from) {
        params.push(date_from);
        clauses.push(`p.purchased_at >= $${params.length}`);
      }
      if (date_to) {
        params.push(date_to);
        clauses.push(`p.purchased_at <= $${params.length}`);
      }
      params.push(boundedLimit);

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

    async chefContext({
      tenant_id,
      request_id,
      window_days = 365
    } = {}) {
      requireTenant(tenant_id);
      const days = boundedInteger(window_days, 365, 3650, "window_days");

      const products = await db.query(
        `SELECT DISTINCT pr.product_id, pr.canonical_name, pr.brand, pr.category,
                pr.package_quantity::text, pr.package_unit, pr.gtin
           FROM ${table("products")} pr
           JOIN ${table("purchase_items")} i ON i.product_id = pr.product_id
           JOIN ${table("purchases")} p ON p.purchase_id = i.purchase_id
          WHERE p.household_id = $1
            AND (pr.is_food = true OR pr.domain = 'culinary')
          ORDER BY pr.canonical_name`,
        [scopedHouseholdId]
      );

      const items = await db.query(
        `SELECT i.purchase_item_id, i.purchase_id, i.product_id, i.quantity::text,
                i.quantity_unit, i.measured_weight_kg::text, i.unit_price::text,
                i.line_total::text, i.currency, p.purchased_at::text, p.merchant_id
           FROM ${table("purchase_items")} i
           JOIN ${table("products")} pr ON pr.product_id = i.product_id
           JOIN ${table("purchases")} p ON p.purchase_id = i.purchase_id
          WHERE p.household_id = $1
            AND (pr.is_food = true OR pr.domain = 'culinary')
            AND p.purchased_at >= CURRENT_DATE - ($2::int * INTERVAL '1 day')
          ORDER BY p.purchased_at DESC, i.purchase_item_id`,
        [scopedHouseholdId, days]
      );

      return envelope(request_id, {
        window_days: days,
        products: products.rows ?? [],
        purchase_items: items.rows ?? []
      });
    },

    async evidenceGet({
      tenant_id,
      request_id,
      evidence_id,
      mode = "metadata"
    } = {}) {
      requireTenant(tenant_id);
      validateScopeId(evidence_id, "evidence_id");
      if (mode !== "metadata") fail("evidence_content_forbidden");

      const r = await db.query(
        `SELECT e.evidence_id, e.batch_id, e.source_id, e.kind, e.sha256,
                e.captured_at::text, e.immutable, e.classification, e.metadata
           FROM ${table("evidence")} e
          WHERE e.evidence_id = $1
            AND EXISTS (
              SELECT 1
                FROM ${table("purchases")} p
               WHERE p.household_id = $2
                 AND p.evidence_ids ? e.evidence_id
            )`,
        [evidence_id, scopedHouseholdId]
      );
      return envelope(request_id, { evidence: r.rows?.[0] ?? null });
    }
  });
}
