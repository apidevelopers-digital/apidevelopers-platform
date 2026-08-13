import {
  createTenantId,
  createWorkspaceId,
} from "../../contracts/src/saas-tenancy.mjs";
import {
  createSubscriptionId,
  createEntitlementId,
} from "../../contracts/src/saas-commercial.mjs";
import {
  createAccessGrantId,
} from "../../contracts/src/saas-access.mjs";

const PRODUCT_ID = "zuni";
const PLAN_ID = "master";
const PRICE_ID = "zuni.master.month.br";
const MONTHLY_AMOUNT = 169000;
const CURRENCY = "BRL";

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function createZuniMasterInstitutionalPilotPlan({
  organizationId,
  principalId,
  tenantSlug = "apidevelopers-digital",
  workspaceSlug = "institutional-zuni",
  tenantDisplayName = "API Developers.digital",
  workspaceDisplayName = "Zuni Institutional",
  createdAt = new Date().toISOString(),
} = {}) {
  requireText(organizationId, "organizationId");
  requireText(principalId, "principalId");
  requireText(tenantSlug, "tenantSlug");
  requireText(workspaceSlug, "workspaceSlug");

  const tenantId = createTenantId(tenantSlug);
  const workspaceId = createWorkspaceId(tenantSlug, workspaceSlug);
  const subscriptionId = createSubscriptionId(tenantSlug, PRODUCT_ID);
  const entitlementId = createEntitlementId(
    tenantSlug,
    workspaceSlug,
    "zuni-master",
  );
  const accessGrantId = createAccessGrantId(
    tenantSlug,
    workspaceSlug,
    PRODUCT_ID,
    principalId,
  );

  return Object.freeze({
    schemaVersion: 1,
    mode: "assisted_activation",
    billing: Object.freeze({
      liveChargeAuthorized: false,
      automaticCharge: false,
      priceId: PRICE_ID,
      currency: CURRENCY,
      monthlyAmount: MONTHLY_AMOUNT,
    }),
    tenant: Object.freeze({
      tenantId,
      organizationId,
      slug: tenantSlug,
      displayName: tenantDisplayName,
      status: "active",
      createdAt,
    }),
    workspace: Object.freeze({
      workspaceId,
      tenantId,
      productId: PRODUCT_ID,
      slug: workspaceSlug,
      displayName: workspaceDisplayName,
      status: "active",
      createdAt,
    }),
    subscription: Object.freeze({
      subscriptionId,
      tenantId,
      productId: PRODUCT_ID,
      planId: PLAN_ID,
      status: "assisted_activation",
      currency: CURRENCY,
      monthlyAmount: MONTHLY_AMOUNT,
      createdAt,
      activatedAt: null,
    }),
    entitlement: Object.freeze({
      entitlementId,
      subscriptionId,
      tenantId,
      workspaceId,
      productId: PRODUCT_ID,
      capability: "zuni.master",
      status: "pending",
      sourcePlanId: PLAN_ID,
      createdAt,
    }),
    accessGrant: Object.freeze({
      accessGrantId,
      principalId,
      tenantId,
      workspaceId,
      productId: PRODUCT_ID,
      subscriptionId,
      entitlementId,
      requiredScopes: Object.freeze([
        "zuni:inbox:read",
        "zuni:contacts:read",
        "zuni:templates:read",
        "zuni:diagnostics:read",
        "uni:assist:invoke",
      ]),
      grantedScopes: Object.freeze([]),
      status: "pending",
      createdAt,
      activatedAt: null,
    }),
    activation: Object.freeze({
      permittedWithoutBillingCharge: true,
      requiresExplicitProductionApproval: true,
      requiresResolvedPrincipal: true,
      requiresSuccessfulProvisioning: true,
      activateSubscription: false,
      activateEntitlement: false,
      activateAccessGrant: false,
    }),
  });
}

export const zuniMasterInstitutionalPilotConstants = Object.freeze({
  productId: PRODUCT_ID,
  planId: PLAN_ID,
  priceId: PRICE_ID,
  currency: CURRENCY,
  monthlyAmount: MONTHLY_AMOUNT,
});
