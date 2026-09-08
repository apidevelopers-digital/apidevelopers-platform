import crypto from "node:crypto";
import { assertCanonicalId, createCanonicalId } from "../../contracts/src/canonical-ids.mjs";

export const MITRA_PRODUCT_ID = "mitra";
export const MITRA_COMMERCIAL_MODE_V1 = "dry_run_assisted";
export const MITRA_COMMERCIAL_CONTRACT_VERSION_V1 = "mitra-commercial-access/v1";

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    const error = new TypeError(`${name} must be a non-empty string`);
    error.code = "MITRA_FIELD_REQUIRED";
    throw error;
  }
  return value.trim();
}

function requireIsoDate(value, name) {
  const normalized = requireString(value, name);
  if (Number.isNaN(Date.parse(normalized))) {
    const error = new TypeError(`${name} must be an ISO-8601 date`);
    error.code = "MITRA_DATE_INVALID";
    throw error;
  }
  return normalized;
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
  const normalizedLabel = requireString(label, "label");

  if (currency !== "BRL") {
    const error = new TypeError("Mitra v1 catalog currency must be BRL");
    error.code = "MITRA_PLAN_CURRENCY_INVALID";
    throw error;
  }
  if (!["pending_decision", "approved"].includes(pricingStatus)) {
    const error = new TypeError("pricingStatus must be pending_decision or approved");
    error.code = "MITRA_PLAN_PRICING_STATUS_INVALID";
    throw error;
  }
  if (monthlyAmount !== null && (!Number.isInteger(monthlyAmount) || monthlyAmount < 0)) {
    const error = new TypeError = new TypeError("monthlyAmount must be null or a non-negative integer in major BRL units");
    error.code = "MITRA_PLAN_AMOUNT_INVALID";
    throw error;
  }
  if (pricingStatus === "approved" && monthlyAmount === null) {
    const error = new TypeError("approved pricing requires monthlyAmount");
    error.code = "MITRA_PLAN_APPROVED_PRICE_REQUIRED";
    throw error;
  }
  if (sellable === true && pricingStatus !== "approved") {
    const error = new TypeError("sellable plans require approved pricing");
    error.code = "MITRA_PLAN_NOT_APPROVED";
    throw error;
  }
  if (!Array.isArray(capabilities)) {
    const error = new TypeError("capabilities must be an array");
    error.code = "MITRA_PLAN_CAPABILITIES_INVALID";
    throw error;
  }

  return Object.freeze({
    schemaVersion: 1,
    productId: MITRA_PRODUCT_ID,
    planId,
    label: normalizedLabel,
    currency,
    monthlyAmount,
    pricingStatus,
    sellable: sellable === true,
    capabilities: Object.freeze(
      capabilities.map(
        (value) => requireString(value, "capability").toLowerCase(),
      ),
    ),
  });
}

export function createMitraPlanCatalogV1({ plans = [] } = {}) {
  if (!Array.isArray(plans)) {
    const error = new TypeError("plans must be an array");
    error.code = "MITRA_PLAN_CATALOG_INVALID";
    throw error;
  }

  const byId = new Map();
  for (const plan of plans) {
    if (!plan || typeof plan !== "object") {
      const error = new TypeError("each plan must be an object");
      error.code = "MITRA_PLAN_INVALID";
      throw error;
    }
    const normalized = createMitraPlanDefinitionV1(plan);
    if (byId.has(normalized.planId)) {
      const error = new Error(`duplicate Mitra planId: ${normalized.planId}`);
      error.code = "MITRA_PLAN_DUPLICATE";
      throw error;
    }
    byId.set(normalized.planId, normalized);
  }

  const entries = Object.freeze([...byId.values()]);
  return Object.freeze({
    schemaVersion: 1,
    productId: MITRA_PRODUCT_ID,
    pricingDecisionRequired: entries.every((plan) => plan.sellable !== true),
    plans: entries,
  });
}

// No production price has been approved in GitHub yet.
// The canonical runtime therefore starts fail-closed with no sellable plan.
export const MITRA_PLAN_CATALOG_V1 = createMitraPlanCatalogV1();

export function resolveMitraPlanV1(catalog, planId) {
  if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.plans)) {
    const error = new TypeError("catalog must be a Mitra plan catalog");
    error.code = "MITRA_PLAN_CATALOG_INVALID";
    throw error;
  }
  const normalizedPlanId = requireString(planId, "planId");
  const plan = catalog.plans.find((entry) => entry.planId === normalizedPlanId);
  if (!plan) {
    const error = new Error(`unknown Mitra plan: ${normalizedPlanId}`);
    error.code = "MITRA_PLAN_UNKNOWN";
    throw error;
  }
  return plan;
}

function hashOpaque(value) {
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
  if (plan.sellable !== true || plan.pricingStatus !== "approved" || plan.monthlyAmount === null) {
    const error = new Error(`Mitra plan is not commercially approved: ${plan.planId}`);
    error.code = "MITRA_PLAN_NOT_SELLABLE";
    throw error;
  }

  const normalizedBuyerRef = requireString(buyerRef, "buyerRef");
  const normalizedKey = requireString(idempotencyKey, "idempotencyKey");
  const normalizedCreatedAt = requireIsoDate(createdAt, "createdAt");
  const buyerReferenceHash = hashOpaque(normalizedBuyerRef);
  const digest = hashOpaque(
    `${MITRA_COMMERCIAL_CONTRACT_VERSION_V1}|${plan.planId}|${buyerReferenceHash}|${normalizedKey}`,
  ).slice(0, 24);

  const checkoutIntentId = createCanonicalId({
    family: "component",
    segments: ["checkout-intent", MITRA_PRODUCT_ID, digest],
  });

  return Object.freeze({
    schemaVersion: 1,
    contractVersion: MITRA_COMMERCIAL_CONTRACT_VERSION_V1,
    checkoutIntentId,
    productId: MITRA_PRODUCT_ID,
    plan: Object.freeze({
      planId: plan.planId,
      label: plan.label,
      currency: plan.currency,
      monthlyAmount: plan.monthlyAmount,
      capabilities: plan.capabilities,
    }),
    buyerReferenceHash,
    status: "prepared",
    paymentMode: MITRA_COMMERCIAL_MODE_V1,
    automaticCharge: false,
    productionWriteAuthorized: false,
    subscriptionActivated: false,
    entitlementActivated: false,
    createdAt: normalizedCreatedAt,
  });
}

export function assertMitraCheckoutIntentSafeV1(intent) {
  if (!intent || typeof intent !== "object") {
    const error = new TypeError("intent must be an object");
    error.code = "MITRA_CHECKOUT_INTENT_REQUIRED";
    throw error;
  }
  assertCanonicalId(intent.checkoutIntentId, { expectedFamily: "component" });
  if (
    intent.productId !== MITRA_PRODUCT_ID ||
    intent.paymentMode !== MITRA_COMMERCIAL_MODE_V1 ||
    intent.automaticCharge !== false ||
    intent.productionWriteAuthorized !== false ||
    intent.subscriptionActivated !== false ||
    intent.entitlementActivated !== false
  ) {
    const error = new Error("Mitra checkout intent safety boundary violated");
    error.code = "MITRA_CHECKOUT_INTENT_UNSAFE";
    throw error;
  }
  return true;
}
