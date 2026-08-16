import {
  createSubscription,
  createSubscriptionId,
  createEntitlement,
  createEntitlementId,
} from "../../contracts/src/saas-commercial.mjs";
import {
  createTenant,
  createTenantId,
  createWorkspace,
  createWorkspaceId,
} from "../../contracts/src/saas-tenancy.mjs";
import { createCanonicalId } from "../../contracts/src/canonical-ids.mjs";

const ACTIVE_COMMERCIAL_STATES = new Set(["early_access", "active"]);
const BLOCKED_COMMERCIAL_STATES = new Set(["preview", "proposal", "disabled"]);

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function requireInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return value;
}

function normalizeCapabilities(plan) {
  const capabilities = requireObject(plan.capabilities ?? {}, "plan.capabilities");
  const limits = requireObject(plan.limits ?? {}, "plan.limits");
  const entries = [];

  for (const [name, value] of Object.entries(capabilities)) {
    const capability = requireText(name, "capability").toLowerCase();
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
    entries.push(Object.freeze({ capability, kind: "feature", value: normalized }));
  }

  for (const [name, value] of Object.entries(limits)) {
    const capability = `limit.${requireText(name, "limit").toLowerCase()}`;
    entries.push(Object.freeze({
      capability,
      kind: "limit",
      value: requireInteger(value, `plan.limits.${name}`),
    }));
  }

  entries.sort((a, b) => a.capability.localeCompare(b.capability));
  return Object.freeze(entries);
}

export function validateZuniCommercialPlanSnapshot(plan) {
  requireObject(plan, "plan");

  const id = requireText(plan.id, "plan.id").toLowerCase();
  const productId = requireText(plan.product_id ?? plan.productId ?? "zuni", "plan.product_id").toLowerCase();
  const commercialState = requireText(plan.commercial_state, "plan.commercial_state").toLowerCase();
  const pricingStatus = requireText(plan.pricing_status, "plan.pricing_status").toLowerCase();
  const sellable = plan.sellable === true;
  const pricing = requireObject(plan.pricing, "plan.pricing");
  const monthlyCents = requireInteger(pricing.monthly_cents, "plan.pricing.monthly_cents");

  if (productId !== "zuni") {
    throw new Error("zuni activation plan requires product_id=zuni");
  }
  if (BLOCKED_COMMERCIAL_STATES.has(commercialState) || pricingStatus !== "published" || !sellable) {
    throw new Error(`plan is not commercially activatable: ${id}`);
  }
  if (!ACTIVE_COMMERCIAL_STATES.has(commercialState)) {
    throw new Error(`unsupported commercial state for activation: ${commercialState}`);
  }

  return Object.freeze({
    schemaVersion: 1,
    productId,
    planId: id,
    commercialState,
    pricingStatus,
    sellable,
    currency: "BRL",
    monthlyAmount: Math.trunc(monthlyCents / 100),
    monthlyAmountCents: monthlyCents,
    capabilities: normalizeCapabilities(plan),
  });
}

export function createZuniActivationPlan({
  plan,
  tenantSlug,
  tenantDisplayName,
  organizationId,
  workspaceSlug = "principal",
  workspaceDisplayName = "Principal",
  createdAt = new Date().toISOString(),
} = {}) {
  const commercial = validateZuniCommercialPlanSnapshot(plan);
  const normalizedTenantSlug = requireText(tenantSlug, "tenantSlug").toLowerCase();
  const normalizedWorkspaceSlug = requireText(workspaceSlug, "workspaceSlug").toLowerCase();

  const tenantId = createTenantId(normalizedTenantSlug);
  const workspaceId = createWorkspaceId(normalizedTenantSlug, normalizedWorkspaceSlug);
  const subscriptionId = createSubscriptionId(normalizedTenantSlug, commercial.productId);

  const tenant = createTenant({
    tenantId,
    organizationId,
    slug: normalizedTenantSlug,
    displayName: requireText(tenantDisplayName, "tenantDisplayName"),
    status: "active",
    createdAt,
  });
  const workspace = createWorkspace({
    workspaceId,
    tenantId,
    productId: commercial.productId,
    slug: normalizedWorkspaceSlug,
    displayName: requireText(workspaceDisplayName, "workspaceDisplayName"),
    status: "active",
    createdAt,
  });

  const subscription = createSubscription({
    subscriptionId,
    tenantId,
    productId: commercial.productId,
    planId: commercial.planId,
    status: "assisted_activation",
    currency: commercial.currency,
    monthlyAmount: commercial.monthlyAmount,
    createdAt,
  });

  const entitlements = commercial.capabilities.map(({ capability, kind, value }) => {
    const entitlementId = createEntitlementId(
      normalizedTenantSlug,
      normalizedWorkspaceSlug,
      capability,
    );
    return Object.freeze({
      record: createEntitlement({
        entitlementId,
        subscriptionId,
        tenantId,
        workspaceId,
        productId: commercial.productId,
        capability,
        status: "pending",
        sourcePlanId: commercial.planId,
        createdAt,
      }),
      kind,
      value,
    });
  });

  const correlationId = createCanonicalId({
    family: "component",
    segments: ["correlation", "zuni", normalizedTenantSlug, commercial.planId],
  });

  return Object.freeze({
    schemaVersion: 1,
    productId: commercial.productId,
    planId: commercial.planId,
    commercialState: commercial.commercialState,
    pricingStatus: commercial.pricingStatus,
    correlationId,
    tenant,
    workspace,
    subscription,
    entitlements: Object.freeze(entitlements),
    activationMode: "assisted",
    automaticCharge: false,
    productionWriteAuthorized: false,
  });
}
