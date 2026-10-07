export function buildFamilyDataCoreSchemaSql({ schema = "family_data" } = {}) {
  const q = (name) => `"${schema}"."${name}"`;
  return [
    `CREATE SCHEMA IF NOT EXISTS "${schema}"`,
    `CREATE TABLE IF NOT EXISTS ${q("purchases")} (
      purchase_id text PRIMARY KEY,
      household_id text NOT NULL,
      merchant_id text,
      source_id text,
      batch_id text,
      external_order_id text,
      fiscal_access_key text,
      purchased_at date NOT NULL,
      currency text NOT NULL,
      subtotal numeric(18,2) NOT NULL,
      discount numeric(18,2) NOT NULL DEFAULT 0,
      total numeric(18,2) NOT NULL,
      status text NOT NULL,
      reconciliation_status text,
      evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS purchases_fiscal_key_uq
      ON ${q("purchases")} (source_id, fiscal_access_key)
      WHERE fiscal_access_key IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS ${q("products")} (
      product_id text PRIMARY KEY,
      canonical_name text NOT NULL,
      brand text,
      category text,
      package_quantity numeric,
      package_unit text,
      gtin text,
      domain text,
      is_food boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'active'
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("purchase_items")} (
      purchase_item_id text PRIMARY KEY,
      purchase_id text NOT NULL REFERENCES ${q("purchases")}(purchase_id),
      line_number integer,
      raw_description text,
      product_id text REFERENCES ${q("products")}(product_id),
      quantity numeric,
      quantity_unit text,
      measured_weight_kg numeric,
      unit_price numeric(18,4),
      line_discount numeric(18,2) NOT NULL DEFAULT 0,
      line_total numeric(18,2) NOT NULL,
      currency text NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS purchase_items_product_idx
      ON ${q("purchase_items")} (product_id, purchase_id)`,
    `CREATE TABLE IF NOT EXISTS ${q("payments")} (
      payment_id text PRIMARY KEY,
      purchase_id text NOT NULL REFERENCES ${q("purchases")}(purchase_id),
      method text NOT NULL,
      provider_label_raw text,
      amount numeric(18,2) NOT NULL,
      currency text NOT NULL,
      installments integer
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("evidence")} (
      evidence_id text PRIMARY KEY,
      batch_id text,
      source_id text,
      kind text NOT NULL,
      storage_ref text,
      sha256 text,
      captured_at timestamptz,
      immutable boolean NOT NULL DEFAULT true,
      classification text NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("product_aliases")} (
      alias_id text PRIMARY KEY,
      product_id text NOT NULL REFERENCES ${q("products")}(product_id),
      source_id text,
      raw_description text NOT NULL,
      normalized_description text,
      match_method text,
      confidence numeric(5,4),
      review_status text
    )`
  ];
}
