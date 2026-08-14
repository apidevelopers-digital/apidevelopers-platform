import { authorize } from "@apidevelopers/auth-core";
import {
  createCanonicalId,
  createTenantId,
  createWorkspaceId,
  createSubscriptionId,
  createEntitlementId,
  createProvisioningJobId,
  createAccessGrantId,
} from "@apidevelopers/contracts";

const PROVISION_SCOPE = "saas:provision";
const PRODUCT_ID = "zuni";
const HEX64 = /^[a-f0-9]{64}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IDEMPOTENCY = /^[A-Za-z0-9_.:-]{8,200}$/;

const response = (status, payload) => Object.freeze({
  status,
  headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
  body: JSON.stringify(payload),
});

function bodyOf(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError("body_required");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("body_invalid");
  return parsed;
}
function text(value, name) {
  const out = String(value ?? "").trim();
  if (!out) throw new TypeError(`${name}_required`);
  return out;
}
function slug(value, name) {
  const out = text(value, name).toLowerCase();
  if (!SLUG.test(out)) throw new TypeError(`${name}_invalid`);
  return out;
}
function amount(value) {
  const out = Number(value);
  if (!Number.isSafeInteger(out) || out < 0) throw new TypeError("monthlyAmount_invalid");
  return out;
}
function assertSame(actual, expected, code) {
  if (actual !== expected) throw new Error(code);
}
function checkSubscription(record, { planId, currency, monthlyAmount }) {
  if (!record) return;
  assertSame(record.productId, PRODUCT_ID, "subscription_binding_mismatch");
  assertSame(record.planId, planId, "subscription_binding_mismatch");
  assertSame(record.currency, currency, "subscription_binding_mismatch");
  assertSame(record.monthlyAmount, monthlyAmount, "subscription_binding_mismatch");
}
function checkEntitlement(record, { subscriptionId, workspaceId, planId }) {
  if (!record) return;
  assertSame(record.subscriptionId, subscriptionId, "entitlement_binding_mismatch");
  assertSame(record.workspaceId, workspaceId, "entitlement_binding_mismatch");
  assertSame(record.productId, PRODUCT_ID, "entitlement_binding_mismatch");
  assertSame(record.sourcePlanId, planId, "entitlement_binding_mismatch");
}
function checkJob(record, { subscriptionId, workspaceId, idempotencyKey }) {
  if (!record) return;
  assertSame(record.subscriptionId, subscriptionId, "provisioning_binding_mismatch");
  assertSame(record.workspaceId, workspaceId, "provisioning_binding_mismatch");
  assertSame(record.productId, PRODUCT_ID, "provisioning_binding_mismatch");
  assertSame(record.idempotencyKey, idempotencyKey, "provisioning_binding_mismatch");
}
function checkGrant(resolution, { workspaceId, subscriptionId, entitlementId }) {
  if (!resolution?.resolved) return;
  const grant = resolution.grant;
  assertSame(grant.workspaceId, workspaceId, "access_binding_mismatch");
  assertSame(grant.subscriptionId, subscriptionId, "access_binding_mismatch");
  assertSame(grant.entitlementId, entitlementId, "access_binding_mismatch");
  assertSame(grant.productId, PRODUCT_ID, "access_binding_mismatch");
}

export function createSaasProvisioningApp({
  authenticator,
  saasRuntime,
  saasAccess,
  federatedPrincipal,
  clock = () => new Date().toISOString(),
} = {}) {
  const required = {
    authenticate: authenticator?.authenticate,
    registerTenantWorkspace: saasRuntime?.registerTenantWorkspace,
    getSubscription: saasRuntime?.getSubscription,
    startSubscription: saasRuntime?.startSubscription,
    activateSubscription: saasRuntime?.activateSubscription,
    getEntitlement: saasRuntime?.getEntitlement,
    grantEntitlement: saasRuntime?.grantEntitlement,
    getProvisioningJob: saasRuntime?.getProvisioningJob,
    enqueueProvisioning: saasRuntime?.enqueueProvisioning,
    claimProvisioning: saasRuntime?.claimProvisioning,
    completeProvisioning: saasRuntime?.completeProvisioning,
    resolveActiveGrant: saasAccess?.resolveActiveGrant,
    grantAccess: saasAccess?.grantAccess,
    activateAccess: saasAccess?.activateAccess,
    setOnboarding: saasAccess?.setOnboarding,
    resolveFederatedPrincipal: federatedPrincipal?.resolveFederatedPrincipal,
  };
  for (const [name, fn] of Object.entries(required)) {
    if (typeof fn !== "function") throw new TypeError(`${name}_function_required`);
  }

  return Object.freeze({
    async handleRequest({ method = "GET", url = "/", headers = {}, body = "" } = {}) {
      const pathname = new URL(String(url), "http://api-gateway.local").pathname;
      if (String(method).toUpperCase() !== "POST" || pathname !== "/v1/saas/provision") return null;

      const actor = await authenticator.authenticate(headers);
      if (!actor) return response(401, { ok: false, reason: "unauthorized" });
      const decision = authorize(actor, { scopes: [PROVISION_SCOPE] });
      if (!decision.allowed) return response(403, {
        ok: false,
        reason: "provision_scope_forbidden",
        missingScopes: decision.missingScopes,
      });

      try {
        const input = bodyOf(body);
        const tenantSlug = slug(input.tenantSlug, "tenantSlug");
        const workspaceSlug = slug(input.workspaceSlug ?? "zuni-main", "workspaceSlug");
        const displayName = text(input.displayName, "displayName");
        const planId = slug(input.planId, "planId");
        const currency = text(input.currency ?? "BRL", "currency").toUpperCase();
        if (currency !== "BRL") throw new TypeError("currency_invalid");
        const monthlyAmount = amount(input.monthlyAmount);
        const subjectRef = text(input.subjectRef, "subjectRef").toLowerCase();
        if (!HEX64.test(subjectRef)) throw new TypeError("subjectRef_invalid");
        const idempotencyKey = text(input.idempotencyKey, "idempotencyKey");
        if (!IDEMPOTENCY.test(idempotencyKey)) throw new TypeError("idempotencyKey_invalid");

        const at = clock();
        const tenantId = createTenantId(tenantSlug);
        const workspaceId = createWorkspaceId(tenantSlug, workspaceSlug);
        const subscriptionId = createSubscriptionId(tenantSlug, PRODUCT_ID);
        const entitlementId = createEntitlementId(tenantSlug, workspaceSlug, "workspace-access");
        const provisioningJobId = createProvisioningJobId(tenantSlug, workspaceSlug, PRODUCT_ID);

        await saasRuntime.registerTenantWorkspace({
          tenant: {
            tenantId,
            organizationId: createCanonicalId({ family: "component", segments: ["organization", tenantSlug] }),
            slug: tenantSlug,
            displayName,
            status: "active",
            createdAt: at,
          },
          workspace: {
            workspaceId,
            tenantId,
            productId: PRODUCT_ID,
            slug: workspaceSlug,
            displayName: text(input.workspaceDisplayName ?? `${displayName} · Zuni`, "workspaceDisplayName"),
            status: "active",
            createdAt: at,
          },
        });

        let subscription = await saasRuntime.getSubscription(subscriptionId);
        checkSubscription(subscription, { planId, currency, monthlyAmount });
        if (!subscription) subscription = await saasRuntime.startSubscription({
          subscriptionId, tenantId, productId: PRODUCT_ID, planId,
          status: "assisted_activation", currency, monthlyAmount, createdAt: at,
        });
        if (subscription.status !== "active") {
          subscription = await saasRuntime.activateSubscription({ subscriptionId, activatedAt: at });
        }

        let entitlement = await saasRuntime.getEntitlement(entitlementId);
        checkEntitlement(entitlement, { subscriptionId, workspaceId, planId });
        if (!entitlement) entitlement = await saasRuntime.grantEntitlement({
          entitlementId, subscriptionId, tenantId, workspaceId, productId: PRODUCT_ID,
          capability: "workspace-access", status: "active", sourcePlanId: planId, createdAt: at,
        });

        let job = await saasRuntime.getProvisioningJob(provisioningJobId);
        checkJob(job, { subscriptionId, workspaceId, idempotencyKey });
        if (!job) {
          const enqueued = await saasRuntime.enqueueProvisioning({
            provisioningJobId, subscriptionId, tenantId, workspaceId, productId: PRODUCT_ID,
            entitlementIds: [entitlementId], idempotencyKey, requestedAt: at,
          });
          job = enqueued.job;
        }
        if (job.status === "queued") job = await saasRuntime.claimProvisioning({ provisioningJobId, at });
        if (job.status === "running") job = await saasRuntime.completeProvisioning({
          provisioningJobId,
          at,
          result: { tenantReady: true, workspaceReady: true, productReady: true, mode: "shared_saas_runtime" },
        });
        if (job.status !== "succeeded") throw new Error("provisioning_not_ready");

        const principal = await federatedPrincipal.resolveFederatedPrincipal({
          tenantId,
          provider: "checkout-activation",
          externalSubject: subjectRef,
          subjectType: "checkout_subject_ref",
        });
        const principalKey = String(principal.principalId ?? "").split(".").at(-1);
        if (!SLUG.test(principalKey)) throw new Error("principal_key_invalid");
        const accessGrantId = createAccessGrantId(tenantSlug, workspaceSlug, PRODUCT_ID, principalKey);

        let grantResolution = await saasAccess.resolveActiveGrant({
          tenantId, principalId: principal.principalId, productId: PRODUCT_ID,
        });
        checkGrant(grantResolution, { workspaceId, subscriptionId, entitlementId });
        if (!grantResolution.resolved) {
          const pending = await saasAccess.grantAccess({
            accessGrantId, principalId: principal.principalId, tenantId, workspaceId,
            productId: PRODUCT_ID, subscriptionId, entitlementId,
            requiredScopes: ["zuni:read", "zuni:reply"],
            grantedScopes: ["zuni:read", "zuni:reply"],
            status: "pending", createdAt: at,
          });
          const active = await saasAccess.activateAccess({
            accessGrantId: pending.accessGrantId, provisioningJobId, at,
          });
          grantResolution = { resolved: true, grant: active };
        }

        await saasAccess.setOnboarding({
          tenantId, workspaceId, productId: PRODUCT_ID, status: "completed",
          requiredSteps: ["payment_approved", "provisioning_succeeded", "access_activated"],
          completedSteps: ["payment_approved", "provisioning_succeeded", "access_activated"],
          updatedAt: at,
        });

        return response(201, {
          ok: true,
          provisioned: true,
          tenantId,
          workspaceId,
          subscriptionId,
          entitlementId,
          provisioningJobId,
          principalId: principal.principalId,
          accessGrantId: grantResolution.grant.accessGrantId,
          productId: PRODUCT_ID,
          planId,
          status: "active",
        });
      } catch (error) {
        const message = String(error?.message ?? "");
        const invalid = /required|invalid|must be|JSON|currency/i.test(message);
        return response(invalid ? 400 : 409, {
          ok: false,
          reason: invalid ? "invalid_provision_request" : "provisioning_failed",
        });
      }
    },
  });
}
export { PROVISION_SCOPE };
