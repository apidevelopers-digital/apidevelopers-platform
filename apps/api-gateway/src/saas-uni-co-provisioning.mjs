import { authorize } from "@apidevelopers/auth-core";
import {
  createAccessGrantId,
  createCanonicalId,
  createEntitlementId,
  createProvisioningJobId,
  createSubscriptionId,
  createTenantId,
  createWorkspaceId,
} from "@apidevelopers/contracts";

export const UNI_CO_PROVISIONING_PRODUCT_ID = "product:uni-co";
export const MITRA_PROVISIONING_PRODUCT_ID = "product:mitra";

const PRODUCT_SLUGS = Object.freeze({
  [UNI_CO_PROVISIONING_PRODUCT_ID]: "uni-co",
  [MITRA_PROVISIONING_PRODUCT_ID]: "mitra",
});

const DEFAULT_PRODUCT_ID = UNI_CO_PROVISIONING_PRODUCT_ID;
const PROVIDER = "unico-operator-session";
const SCOPE = "saas:provision";
const PLAN_ID = "internal-preview";
const WEB_SCOPE = "web:chat";
const HEX64 = /^[a-f0-9]{64}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IDEM = /^[A-Za-z0-9_.:-]{8,200}$/;

const PROVISIONING_STAGE_REASONS = Object.freeze({
  request: "uni_co_provisioning_not_complete",
  tenant_workspace: "uni_co_customer_tenant_not_active",
  subscription: "uni_co_customer_account_not_ready",
  entitlement: "uni_co_customer_membership_failed",
  entitlement_get: "uni_co_customer_account_not_ready",
  entitlement_grant: "uni_co_customer_membership_failed",
  entitlement_tenant_binding: "uni_co_customer_tenant_not_active",
  entitlement_workspace_binding: "uni_co_customer_workspace_not_active",
  entitlement_product_binding: "uni_co_product_mismatch",
  entitlement_subscription_binding: "uni_co_customer_account_not_ready",
  entitlement_status: "uni_co_customer_workspace_not_active",
  provisioning_job: "uni_co_provisioning_not_complete",
  federated_principal: "uni_co_principalId_required",
  access_grant: "uni_co_customer_access_grant_not_resolved",
  onboarding: "uni_co_customer_workspace_not_active",
});

const reply = (status, payload) => Object.freeze({
  status,
  headers: Object.freeze({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  }),
  body: JSON.stringify(payload),
});

function req(value, name) {
  const out = String(value ?? "").trim();
  if (!out) throw new TypeError(`${name}_required`);
  return out;
}

function reqSlug(value, name) {
  const out = req(value, name).toLowerCase();
  if (!SLUG.test(out)) throw new TypeError(`${name}_invalid`);
  return out;
}

function bodyOf(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) throw new TypeError("body_required");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("body_invalid");
  }
  return parsed;
}

function same(actual, expected, code) {
  if (actual !== expected) throw new Error(code);
}

function pkey(id) {
  const out = req(id, "principalId").split(".").at(-1);
  if (!SLUG.test(out)) throw new Error("principal_key_invalid");
  return out;
}

function resolveProduct(inputProductId) {
  const productId = String(inputProductId ?? DEFAULT_PRODUCT_ID).trim() || DEFAULT_PRODUCT_ID;
  const productSlug = PRODUCT_SLUGS[productId];
  if (!productSlug) throw new TypeError("productId_invalid");
  return Object.freeze({ productId, productSlug });
}

function resolveProductWorkspaceSlug(workspaceSlug, { productId, productSlug }) {
  if (productId !== MITRA_PROVISIONING_PRODUCT_ID) return workspaceSlug;
  const suffix = `-${productSlug}`;
  return workspaceSlug.endsWith(suffix) ? workspaceSlug : `${workspaceSlug}${suffix}`;
}

function resolveEntitlementCapability({ productId }) {
  return productId === MITRA_PROVISIONING_PRODUCT_ID ? "web-chat-mitra" : "web-chat";
}

function provisioningReasonForStage(stage) {
  return PROVISIONING_STAGE_REASONS[stage] ?? "uni_co_provisioning_not_complete";
}

export function createUniCoProvisioningApp({
  authenticator,
  saasRuntime,
  saasAccess,
  federatedPrincipal,
  clock = () => new Date().toISOString(),
} = {}) {
  for (const [name, fn] of Object.entries({
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
    resolveFederatedPrincipal: federatedPrincipal?.resolveFederatedPrincipal,
    resolveActiveGrant: saasAccess?.resolveActiveGrant,
    grantAccess: saasAccess?.grantAccess,
    activateAccess: saasAccess?.activateAccess,
    setOnboarding: saasAccess?.setOnboarding,
  })) {
    if (typeof fn !== "function") throw new TypeError(`${name}_function_required`);
  }

  return Object.freeze({
    async handleRequest({ method = "GET", url = "/", headers = {}, body = "" } = {}) {
      const path = new URL(String(url), "http://gateway.local").pathname;
      if (String(method).toUpperCase() !== "POST" || path !== "/v1/saas/uni-co/provision") return null;

      const actor = await authenticator.authenticate(headers);
      if (!actor) return reply(401, { ok: false, reason: "unauthorized" });

      const authz = authorize(actor, { scopes: [SCOPE] });
      if (!authz.allowed) {
        return reply(403, { ok: false, reason: "provision_scope_forbidden", missingScopes: authz.missingScopes });
      }

      let provisioningStage = "request";
      try {
        const input = bodyOf(body);
        const tenantSlug = reqSlug(input.tenantSlug, "tenantSlug");
        const requestedWorkspaceSlug = reqSlug(input.workspaceSlug, "workspaceSlug");
        const displayName = req(input.displayName, "displayName");
        const subjectRef = req(input.subjectRef, "subjectRef").toLowerCase();
        const idempotencyKey = req(input.idempotencyKey, "idempotencyKey");
        const product = resolveProduct(input.productId);
        const { productId, productSlug } = product;
        const workspaceSlug = resolveProductWorkspaceSlug(requestedWorkspaceSlug, product);
        const entitlementCapability = resolveEntitlementCapability(product);

        if (!HEX64.test(subjectRef)) throw new TypeError("subjectRef_invalid");
        if (!IDEM.test(idempotencyKey)) throw new TypeError("idempotencyKey_invalid");

        const at = clock();
        const tenantId = createTenantId(tenantSlug);
        const workspaceId = createWorkspaceId(tenantSlug, workspaceSlug);
        const subscriptionId = createSubscriptionId(tenantSlug, productSlug);
        const provisioningJobId = createProvisioningJobId(tenantSlug, workspaceSlug, productSlug);

        provisioningStage = "tenant_workspace";
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
            productId,
            slug: workspaceSlug,
            displayName: `${displayName} · ${productSlug}`,
            status: "active",
            createdAt: at,
          },
        });

        provisioningStage = "subscription";
        let sub = await saasRuntime.getSubscription(subscriptionId);
        if (!sub) {
          sub = await saasRuntime.startSubscription({
            subscriptionId,
            tenantId,
            productId,
            planId: PLAN_ID,
            status: "assisted_activation",
            currency: "BRL",
            monthlyAmount: 0,
            createdAt: at,
          });
        } else {
          same(sub.tenantId, tenantId, "subscription_binding_mismatch");
          same(sub.productId, productId, "subscription_binding_mismatch");
          same(sub.planId, PLAN_ID, "subscription_binding_mismatch");
          same(sub.monthlyAmount, 0, "subscription_binding_mismatch");
        }

        if (sub.status !== "active") {
          if (!["assisted_activation", "trial"].includes(sub.status)) throw new Error("subscription_not_activatable");
          sub = await saasRuntime.activateSubscription({ subscriptionId, activatedAt: at });
        }

        const entitlementId = createEntitlementId(tenantSlug, workspaceSlug, entitlementCapability);
        provisioningStage = "entitlement_get";
        let ent = await saasRuntime.getEntitlement(entitlementId);
        if (!ent) {
          provisioningStage = "entitlement_grant";
          ent = await saasRuntime.grantEntitlement({
            entitlementId,
            subscriptionId,
            tenantId,
            workspaceId,
            productId,
            capability: entitlementCapability,
            status: "active",
            sourcePlanId: PLAN_ID,
            createdAt: at,
          });
        } else {
          provisioningStage = "entitlement_tenant_binding";
          same(ent.tenantId, tenantId, "entitlement_binding_mismatch");
          provisioningStage = "entitlement_workspace_binding";
          same(ent.workspaceId, workspaceId, "entitlement_binding_mismatch");
          provisioningStage = "entitlement_product_binding";
          same(ent.productId, productId, "entitlement_binding_mismatch");
          provisioningStage = "entitlement_subscription_binding";
          same(ent.subscriptionId, subscriptionId, "entitlement_binding_mismatch");
          provisioningStage = "entitlement_status";
          if (ent.status !== "active") throw new Error("entitlement_not_active");
        }

        provisioningStage = "provisioning_job";
        let job = await saasRuntime.getProvisioningJob(provisioningJobId);
        if (!job) {
          job = (await saasRuntime.enqueueProvisioning({
            provisioningJobId,
            subscriptionId,
            tenantId,
            workspaceId,
            productId,
            entitlementIds: [entitlementId],
            idempotencyKey,
            requestedAt: at,
          })).job;
        }

        if (job.idempotencyKey !== idempotencyKey) throw new Error("provisioning_idempotency_mismatch");
        if (job.status === "queued") job = await saasRuntime.claimProvisioning({ provisioningJobId, at });
        if (job.status === "running") {
          job = await saasRuntime.completeProvisioning({
            provisioningJobId,
            at,
            result: {
              tenantReady: true,
              workspaceReady: true,
              productReady: true,
              mode: `${productSlug}_internal_preview`,
            },
          });
        }
        if (job.status !== "succeeded") throw new Error("provisioning_not_ready");

        provisioningStage = "federated_principal";
        const principal = await federatedPrincipal.resolveFederatedPrincipal({
          tenantId,
          provider: PROVIDER,
          externalSubject: subjectRef,
          subjectType: "delegated_subject_ref",
        });

        provisioningStage = "access_grant";
        const accessGrantId = createAccessGrantId(tenantSlug, workspaceSlug, productSlug, pkey(principal.principalId));
        let resolved = await saasAccess.resolveActiveGrant({ tenantId, principalId: principal.principalId, productId });

        if (!resolved.resolved) {
          const pending = await saasAccess.grantAccess({
            accessGrantId,
            principalId: principal.principalId,
            tenantId,
            workspaceId,
            productId,
            subscriptionId,
            entitlementId,
            requiredScopes: [WEB_SCOPE],
            grantedScopes: [WEB_SCOPE],
            status: "pending",
            createdAt: at,
          });
          if (pending.status !== "pending") throw new Error("access_grant_not_pending");
          resolved = {
            resolved: true,
            grant: await saasAccess.activateAccess({ accessGrantId, provisioningJobId, at }),
          };
        }

        const grant = resolved.grant;
        same(grant.workspaceId, workspaceId, "access_binding_mismatch");
        same(grant.productId, productId, "access_binding_mismatch");
        same(grant.principalId, principal.principalId, "access_binding_mismatch");

        provisioningStage = "onboarding";
        await saasAccess.setOnboarding({
          tenantId,
          workspaceId,
          productId,
          status: "completed",
          requiredSteps: ["provisioning_succeeded", "access_activated"],
          completedSteps: ["provisioning_succeeded", "access_activated"],
          updatedAt: at,
        });

        return reply(201, {
          ok: true,
          provisioned: true,
          tenantId,
          workspaceId,
          principalId: principal.principalId,
          accessGrantId: grant.accessGrantId,
          productId,
          status: "active",
          billing: { mode: "internal-preview", currency: "BRL", monthlyAmount: 0 },
          secretsExposed: false,
        });
      } catch (error) {
        const message = String(error?.message ?? "");
        const invalid = /required|invalid|JSON|idempotency/i.test(message);
        return reply(invalid ? 400 : 409, {
          ok: false,
          reason: invalid ? "invalid_uni_co_provision_request" : provisioningReasonForStage(provisioningStage),
          secretsExposed: false,
        });
      }
    },
  });
}

export const uniCoProvisioningContract = Object.freeze({
  path: "/v1/saas/uni-co/provision",
  productId: DEFAULT_PRODUCT_ID,
  supportedProductIds: Object.freeze(Object.keys(PRODUCT_SLUGS)),
  provider: PROVIDER,
  requiredScope: SCOPE,
  grantedProductScopes: Object.freeze([WEB_SCOPE]),
  automaticLoginProvisioning: false,
  billingMode: "internal-preview",
  monthlyAmount: 0,
});
