import crypto from "node:crypto";
import { assertCanonicalId, createCanonicalId } from "../../contracts/src/canonical-ids.mjs";

export const MITRA_PRODUCT_ID = "mitra";
export const MITRA_COMMERCIAL_MODE_V1 = "dry_run_assisted";

function text(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new TypeError(`${name} is required`);
    error.code = "MITRA_FIELD_REQUIRED";
    throw error;
  }
  return value.trim();
}

export function createMitraPlanDefinitionV1({
  planId,
  label,
  currency = "BRL",
  monthlyAmount = null,
  pricingStatus = "pending_decision",
  sellable = false,
  capabilities = [],
} = {}) {
  assertCanonicalId(planId, { expectedFamily: "plan" });
  if (currency !== "BRL") throw Object.assign(new TypeError("currency must be BRL"), { code: "MITRA_PLAN_CURRENCY_INVALID" });
  if (!["pending_decision", "approved"].includes(pricingStatus)) throw Object.assign(new TypeError("invalid pricingStatus"), { code: "MITRA_PLAN_PRICING_STATUS_INVALID" });
  if (monthlyAmount !== null && (!Number.isInteger(monthlyAmount) || monthlyAmount < 0)) throw Object.assign(new TypeError("invalid monthlyAmount"), { code: "MITRA_PLAN_AMOUNT_INVALID" });
  if (pricingStatus === "approved" && monthlyAmount === null) throw Object.assign(new TypeError("approved price required"), { code: "MITRA_PLAN_APPROVED_PRICE_REQUIRED" });
  if (sellable && pricingStatus !== "approved") throw Object.assign(new TypeError("plan not approved"), { code: "MITRA_PLAN_NOT_APPROVED" });
  if (!Array.isArray(capabilities)) throw Object.assign(new TypeError("capabilities must be array"), { code: "MITRA_PLAN_CAPABILITIES_INVALID" });
  return Object.freeze({
    productId: MITRA_PRODUCT_ID,
    planId,
    label: text(label, "label"),
    currency,
    monthlyAmount,
    pricingStatus,
    sellable: sellable === true,
    capabilities: Object.freeze(capabilities.map((item) => text(item, "capability").toLowerCase())),
  });
}

export function createMitraPlanCatalogV1({ plans = [] } = {}) {
  if (!Array.isArray(plans)) throw Object.assign(new TypeError("plans must be array"), { code: "MITRA_PLAN_CATALOG_INVALID" });
  const seen = new Set();
  const normalized = plans.map((plan) => {
    const entry = createMitraPlanDefinitionV1(plan);
    if (seen.has(entry.planId)) throw Object.assign(new Error("duplicate planId"), { code: "MITRA_PLAN_DUPLICATE" });
    seen.add(entry.planId);
    return entry;
  });
  return Object.freeze({
    productId: MITRA_PRODUCT_ID,
    pricingDecisionRequired: normalized.every((plan) => !plan.sellable),
    plans: Object.freeze(normalized),
  });
}

export const MITRA_PLAN_CATALOG_V1 = createMitraPlanCatalogV1();

export function resolveMitraPlanV1(catalog, planId) {
  if (!catalog || !Array.isArray(catalog.plans)) throw Object.assign(new TypeError("invalid catalog"), { code: "MITRA_PLAN_CATALOG_INVALID" });
  const id = text(planId, "planId");
  const plan = catalog.plans.find((item) => item.planId === id);
  if (!plan) throw Object.assign(new Error(`unknown Mitra plan: ${id}`), { code: "MITRA_PLAN_UNKNOWN" });
  return plan;
}

function digest(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function createMitraCheckoutIntentV1({
  catalog = MITRA_PLAN_CATALOG_V1,
  planId,
  buyerRef,
  idempotencyKey,
  createdAt = new Date().toISOString(),
} = {}) {
  const plan = resolveMitraPlanV1(catalog, planId);
  if (!plan.sellable || plan.pricingStatus !== "approved" || plan.monthlyAmount === null) {
    throw Object.assign(new Error("plan not sellable"), { code: "MITRA_PLAN_NOT_SELLABLE" });
  }
  const buyerHash = digest(text(buyerRef, "buyerRef"));
  const key = text(idempotencyKey, "idempotencyKey");
  if (Number.isNaN(Date.parse(createdAt))) throw Object.assign(new TypeError("invalid createdAt"), { code: "MITRA_DATE_INVALID" });
  const token = digest(`${plan.planId}|${buyerHash}|${key}`).slice(0, 24);
  const checkoutIntentId = createCanonicalId({
    family: "component",
    segments: ["checkout-intent", MITRA_PRODUCT_ID, token],
  });
  return Object.freeze({
    checkoutIntentId,
    productId: MITRA_PRODUCT_ID,
    plan: Object.freeze({
      planId: plan.planId,
      label: plan.label,
      currency: plan.currency,
      monthlyAmount: plan.monthlyAmount,
      capabilities: plan.capabilities,
    }),
    buyerReferenceHash: buyerHash,
    status: "prepared",
    paymentMode: MITRA_COMMERCIAL_MODE_V1,
    automaticCharge: false,
    productionWriteAuthorized: false,
    subscriptionActivated: false,
    entitlementActivated: false,
    createdAt,
  });
}

export function assertMitraCheckoutIntentSafeV1(intent) {
  assertCanonicalId(intent?.checkoutIntentId, { expectedFamily: "component" });
  if (
    intent.productId !== MITRA_PRODUCT_ID ||
    intent.paymentMode !== MITRA_COMMERCIAL_MODE_V1 ||
    intent.automaticCharge !== false ||
    intent.productionWriteAuthorized !== false ||
    intent.subscriptionActivated !== false ||
    intent.entitlementActivated !== false
  ) throw Object.assign(new Error("unsafe Mitra checkout intent"), { code: "MITRA_CHECKOUT_INTENT_UNSAFE" });
  return true;
}
