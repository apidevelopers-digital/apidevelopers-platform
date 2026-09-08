import crypto from "node:crypto";

import { assertAuthContextContract } from "../../contracts/src/auth-context.mjs";
import { createCanonicalId } from "../../contracts/src/canonical-ids.mjs";
import {
  createTenant,
  createTenantId,
  createWorkspace,
  createWorkspaceId,
} from "../../contracts/src/saas-tenancy.mjs";
import {
  createSubscription,
  createSubscriptionId,
  createEntitlement,
  createEntitlementId,
} from "../../contracts/src/saas-commercial.mjs";
import {
  createSaasUser,
  createSaasUserId,
  createRole,
  createRoleId,
  createMembership,
  createMembershipId,
} from "../../contracts/src/saas-membership.mjs";
import {
  assertMitraCheckoutIntentSafeV1,
  MITRA_COMMERCIAL_MODE_V1,
  MITRA_PRODUCT_ID,
} from "./mitra-commercial-access-v1.mjs";

const ACCOUNT_VERSION = "mitra-account-session/v1";
const PROVISIONING_VERSION = "mitra-controlled-provisioning/v1";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function text(value, name) {
  if (typeof value !== "string" || !value.trim()) fail("MITRA_FIELD_REQUIRED", `${name} is required`);
  return value.trim();
}

function digest(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function iso(value, name) {
  const normalized = text(value, name);
  if (Number.isNaN(Date.parse(normalized))) fail("MITRA_DATE_INVALID", `${name} must be ISO-8601`);
  return normalized;
}

export function createMitraAccountSessionV1({
  checkoutIntent,
  authContext,
  buyerReferenceHash,
  accountBindingConfirmed = false,
} = {}) {
  assertMitraCheckoutIntentSafeV1(checkoutIntent);
  assertAuthContextContract(authContext);

  if (authContext.authorized !== false || authContext.tenantId !== null) {
    fail("MITRA_AUTH_PRETENANT_REQUIRED", "Mitra account session must be authenticated before tenancy is assigned");
  }
  if (accountBindingConfirmed !== true) {
    fail("MITRA_ACCOUNT_BINDING_REQUIRED", "verified buyer/account binding is required");
  }
  const buyerHash = text(buyerReferenceHash, "buyerReferenceHash").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(buyerHash) || buyerHash !== checkoutIntent.buyerReferenceHash) {
    fail("MITRA_ACCOUNT_BINDING_MISMATCH", "buyer/account binding does not match checkout intent");
  }

  const principalId = authContext.principal.principalId;
  const accountSessionId = createCanonicalId({
    family: "component",
    segments: [
      "mitra-account-session",
      digest(`${checkoutIntent.checkoutIntentId}|${principalId}|${authContext.authenticationId}`).slice(0, 24),
    ],
  });

  return Object.freeze({
    version: ACCOUNT_VERSION,
    accountSessionId,
    checkoutIntentId: checkoutIntent.checkoutIntentId,
    principalId,
    userId: createSaasUserId(principalId),
    buyerReferenceHash: buyerHash,
    authenticationId: authContext.authenticationId,
    credentialId: authContext.credential.credentialId,
    credentialType: authContext.credential.type,
    credentialExpiresAt: authContext.credential.expiresAt,
    authenticatedAt: authContext.authenticatedAt,
    authenticated: true,
    authorized: false,
    tenantAssigned: false,
    secretMaterialIncluded: false,
    accountBindingConfirmed: true,
    productionWriteAuthorized: false,
  });
}

export function assertMitraAccountSessionSafeV1(session) {
  if (!session || typeof session !== "object") fail("MITRA_ACCOUNT_SESSION_REQUIRED", "account session is required");
  if (
    session.version !== ACCOUNT_VERSION ||
    session.authenticated !== true ||
    session.authorized !== false ||
    session.tenantAssigned !== false ||
    session.secretMaterialIncluded !== false ||
    session.accountBindingConfirmed !== true ||
    session.productionWriteAuthorized !== false
  ) {
    fail("MITRA_ACCOUNT_SESSION_UNSAFE", "Mitra account session safety boundary violated");
  }
  return true;
}

export function createMitraControlledCommercialConfirmationV1({
  checkoutIntent,
  confirmationId,
  confirmedAt = new Date().toISOString(),
  status = "confirmed",
  paymentMode = MITRA_COMMERCIAL_MODE_V1,
} = {}) {
  assertMitraCheckoutIntentSafeV1(checkoutIntent);
  if (status !== "confirmed") fail("MITRA_COMMERCIAL_CONFIRMATION_REQUIRED", "controlled commercial confirmation is required");
  if (paymentMode !== MITRA_COMMERCIAL_MODE_V1) fail("MITRA_PAYMENT_MODE_UNSAFE", "real payment mode is not authorized");

  const id = text(confirmationId, "confirmationId");
  return Object.freeze({
    version: "mitra-controlled-commercial-confirmation/v1",
    confirmationId: id,
    checkoutIntentId: checkoutIntent.checkoutIntentId,
    status,
    paymentMode,
    confirmedAt: iso(confirmedAt, "confirmedAt"),
    chargeCaptured: false,
    automaticCharge: false,
    productionWriteAuthorized: false,
  });
}

function assertControlledConfirmation(confirmation, checkoutIntent) {
  if (
    !confirmation ||
    confirmation.checkoutIntentId !== checkoutIntent.checkoutIntentId ||
    confirmation.status !== "confirmed" ||
    confirmation.paymentMode !== MITRA_COMMERCIAL_MODE_V1 ||
    confirmation.chargeCaptured !== false ||
    confirmation.automaticCharge !== false ||
    confirmation.productionWriteAuthorized !== false
  ) {
    fail("MITRA_COMMERCIAL_CONFIRMATION_UNSAFE", "controlled commercial confirmation is invalid");
  }
}

export function createMitraControlledProvisioningPlanV1({
  checkoutIntent,
  accountSession,
  commercialConfirmation,
} = {}) {
  assertMitraCheckoutIntentSafeV1(checkoutIntent);
  assertMitraAccountSessionSafeV1(accountSession);
  assertControlledConfirmation(commercialConfirmation, checkoutIntent);

  if (
    accountSession.checkoutIntentId !== checkoutIntent.checkoutIntentId ||
    accountSession.buyerReferenceHash !== checkoutIntent.buyerReferenceHash
  ) {
    fail("MITRA_PROVISIONING_BINDING_MISMATCH", "account and checkout are not bound");
  }

  const principalId = accountSession.principalId;
  const tenantKey = digest(`${principalId}|${checkoutIntent.checkoutIntentId}`).slice(0, 12);
  const tenantSlug = `mitra-${tenantKey}`;
  const workspaceSlug = "principal";
  const tenantId = createTenantId(tenantSlug);
  const workspaceId = createWorkspaceId(tenantSlug, workspaceSlug);
  const organizationId = createCanonicalId({
    family: "component",
    segments: ["organization", "mitra", tenantKey],
  });
  const subscriptionId = createSubscriptionId(tenantSlug, MITRA_PRODUCT_ID);
  const userId = createSaasUserId(principalId);
  const roleId = createRoleId(tenantSlug, workspaceSlug, "owner");
  const membershipId = createMembershipId(tenantSlug, workspaceSlug, principalId);
  const createdAt = commercialConfirmation.confirmedAt;

  const tenant = createTenant({
    tenantId,
    organizationId,
    slug: tenantSlug,
    displayName: "Mitra Workspace",
    status: "active",
    createdAt,
  });
  const workspace = createWorkspace({
    workspaceId,
    tenantId,
    productId: MITRA_PRODUCT_ID,
    slug: workspaceSlug,
    displayName: "Principal",
    status: "active",
    createdAt,
  });
  const subscription = createSubscription({
    subscriptionId,
    tenantId,
    productId: MITRA_PRODUCT_ID,
    planId: checkoutIntent.plan.planId,
    status: "assisted_activation",
    currency: checkoutIntent.plan.currency,
    monthlyAmount: checkoutIntent.plan.monthlyAmount,
    createdAt,
  });
  const entitlements = checkoutIntent.plan.capabilities.map((capability) =>
    createEntitlement({
      entitlementId: createEntitlementId(tenantSlug, workspaceSlug, capability),
      subscriptionId,
      tenantId,
      workspaceId,
      productId: MITRA_PRODUCT_ID,
      capability,
      status: "pending",
      sourcePlanId: checkoutIntent.plan.planId,
      createdAt,
    }),
  );
  const user = createSaasUser({ userId, principalId, status: "active", createdAt });
  const role = createRole({
    roleId,
    tenantId,
    workspaceId,
    scope: "workspace",
    key: "owner",
    permissions: ["workspace:admin", "office:enter"],
    status: "active",
    createdAt,
  });
  const membership = createMembership({
    membershipId,
    tenantId,
    workspaceId,
    userId,
    principalId,
    roleId,
    status: "active",
    createdAt,
  });

  const provisioningPlanId = createCanonicalId({
    family: "component",
    segments: ["mitra-provisioning", digest(`${checkoutIntent.checkoutIntentId}|${principalId}`).slice(0, 24)],
  });

  return Object.freeze({
    version: PROVISIONING_VERSION,
    provisioningPlanId,
    checkoutIntentId: checkoutIntent.checkoutIntentId,
    accountSessionId: accountSession.accountSessionId,
    confirmationId: commercialConfirmation.confirmationId,
    tenant,
    workspace,
    user,
    role,
    membership,
    subscription,
    entitlements: Object.freeze(entitlements),
    provisioningMode: "dry_run_assisted",
    automaticCharge: false,
    productionWriteAuthorized: false,
    subscriptionActivated: false,
    entitlementsActivated: false,
    accessReleased: false,
  });
}

export function assertMitraControlledProvisioningPlanSafeV1(plan) {
  if (!plan || typeof plan !== "object") fail("MITRA_PROVISIONING_PLAN_REQUIRED", "provisioning plan is required");
  if (
    plan.version !== PROVISIONING_VERSION ||
    plan.provisioningMode !== "dry_run_assisted" ||
    plan.automaticCharge !== false ||
    plan.productionWriteAuthorized !== false ||
    plan.subscriptionActivated !== false ||
    plan.entitlementsActivated !== false ||
    plan.accessReleased !== false ||
    plan.subscription?.status !== "assisted_activation" ||
    plan.entitlements?.some((entry) => entry.status !== "pending")
  ) {
    fail("MITRA_PROVISIONING_PLAN_UNSAFE", "Mitra provisioning safety boundary violated");
  }
  return true;
}

export async function applyMitraControlledProvisioningPlanV1({
  plan,
  saasRuntime,
  membershipRuntime,
} = {}) {
  assertMitraControlledProvisioningPlanSafeV1(plan);
  if (!saasRuntime || !membershipRuntime) fail("MITRA_RUNTIME_REQUIRED", "SaaS and membership runtimes are required");

  await saasRuntime.registerTenantWorkspace({ tenant: plan.tenant, workspace: plan.workspace });

  let subscription = await saasRuntime.getSubscription(plan.subscription.subscriptionId);
  if (!subscription) subscription = await saasRuntime.startSubscription(plan.subscription);

  const entitlements = [];
  for (const entitlement of plan.entitlements) {
    let current = await saasRuntime.getEntitlement(entitlement.entitlementId);
    if (!current) current = await saasRuntime.grantEntitlement(entitlement);
    entitlements.push(current);
  }

  const user = await membershipRuntime.registerUser(plan.user);
  const role = await membershipRuntime.registerRole(plan.role);
  const membership = await membershipRuntime.addMembership(plan.membership);

  return Object.freeze({
    provisioningPlanId: plan.provisioningPlanId,
    tenant: await saasRuntime.getTenant(plan.tenant.tenantId),
    workspace: await saasRuntime.getWorkspace(plan.workspace.workspaceId),
    user,
    role,
    membership,
    subscription,
    entitlements: Object.freeze(entitlements),
    idempotent: true,
    accessReleased: false,
    productionWriteAuthorized: false,
  });
}
