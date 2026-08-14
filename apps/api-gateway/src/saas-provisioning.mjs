
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
const SUBJECT_REF_PATTERN = /^[a-f0-9]{64}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,200}$/;

function jsonResponse(status, payload) {
  return Object.freeze({
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(payload),
  });
}

function parseBody(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError("body is required");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("body must be a JSON object");
  }
  return parsed;
}

function requiredText(value, name) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function slug(value, name) {
  const text = requiredText(value, name).toLowerCase();
  if (!SLUG_PATTERN.test(text)) throw new TypeError(`${name} is invalid`);
  return text;
}

function amount(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError("monthlyAmount must be a non-negative safe integer");
  }
  return number;
}

function publicResult(value) {
  return Object.freeze({
    tenantId: value.tenantId,
    workspaceId: value.workspaceId,
    subscriptionId: value.subscriptionId,
    entitlementId: value.entitlementId,
    provisioningJobId: value.provisioningJobId,
    principalId: value.principalId,
    accessGrantId: value.accessGrantId,
    productId: PRODUCT_ID,
    planId: value.planId,
    status: value.status,
  });
}

export function createSaasProvisioningApp({
  authenticator,
  saasRuntime,
  saasAccess,
  federatedPrincipal,
  clock = () => new Date().toISOString(),
  subjectProvider = "checkout-activation",
} = {}) {
  if (typeof authenticator?.authenticate !== "function") throw new TypeError("authenticator.authenticate must be a function");
  for (const [name, fn] of Object.entries({
    registerTenantWorkspace: saasRuntime?.registerTenantWorkspace,
    startSubscription: saasRuntime?.startSubscription,
    activateSubscription: saasRuntime?.activateSubscription,
    grantEntitlement: saasRuntime?.grantEntitlement,
    enqueueProvisioning: saasRuntime?.enqueueProvisioning,
    claimProvisioning: saasRuntime?.claimProvisioning,
    completeProvisioning: saasRuntime?.completeProvisioning,
    getSubscription: saasRuntime?.getSubscription,
    getEntitlement: saasRuntime?.getEntitlement,
    getProvisioningJob: saasRuntime?.getProvisioningJob,
    grantAccess: saasAccess?.grantAccess,
    activateAccess: saasAccess?.activateAccess,
    setOnboarding: saasAccess?.setOnboarding,
    resolveFederatedPrincipal: federatedPrincipal?.resolveFederatedPrincipal,
  })) {
    if (typeof fn !== "function") throw new TypeError(`${name} must be a function`);
  }

  return Object.freeze({
    async handleRequest({ method = "GET", url = "/", headers = {}, body = "" } = {}) {
      const pathname = new URL(String(url), "http://api-gateway.local").pathname;
      if (String(method).toUpperCase() !== "POST" || pathname !== "/v1/saas/provision") return null;

      const actor = await authenticator.authenticate(headers);
      if (!actor) return jsonResponse(401, { ok: false, reason: "unauthorized" });

      const decision = authorize(actor, { scopes: [PROVISION_SCOPE] });
      if (!decision.allowed) {
        return jsonResponse(403, {
          ok: false,
          reason: "provision_scope_forbidden",
          missingScopes: decision.missingScopes,
        });
      }

      try {
        const input = parseBody(body);
        const tenantSlug = slug(input.tenantSlug, "tenantSlug");
        const workspaceSlug = slug(input.workspaceSlug ?? "zuni-main", "workspaceSlug");
        const displayName = requiredText(input.displayName, "displayName");
        const workspaceDisplayName = requiredText(input.workspaceDisplayName ?? `${displayName} · Zuni`, "workspaceDisplayName");
        const planId = slug(input.planId, "planId");
        const currency = requiredText(input.currency ?? "BRL", "currency").toUpperCase();
        if (currency !== "BRL") throw new TypeError("currency must be BRL");
        const monthlyAmount = amount(input.monthlyAmount);
        const subjectRef = requiredText(input.subjectRef, "subjectRef").toLowerCase();
        if (!SUBJECT_REF_PATTERN.test(subjectRef)) throw new TypeError("subjectRef must be a 64-char lowercase hex digest");
        const idempotencyKey = requiredText(input.idempotencyKey, "idempotencyKey");
        if (!KEY_PATTERN.test(idempotencyKey)) throw new TypeError("idempotencyKey is invalid");

        const at = clock();
        const tenantId = createTenantId(tenantSlug);
        const organizationId = createCanonicalId({ family: "component", segments: ["organization", tenantSlug] });
        const workspaceId = createWorkspaceId(tenantSlug, workspaceSlug);
        const subscriptionId = createSubscriptionId(tenantSlug, PRODUCT_ID);
        const entitlementId = createEntitlementId(tenantSlug, workspaceSlug, "workspace-access");
        const provisioningJobId = createProvisioningJobId(tenantSlug, workspaceSlug, PRODUCT_ID);

        await saasRuntime.registerTenantWorkspace({
          tenant: {
            tenantId,
            organizationId,
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
            displayName: workspaceDisplayName,
            status: "active",
            createdAt: at,
          },
        });

        let subscription = await saasRuntime.getSubscription(subscriptionId);
        if (!subscription) {
          subscription = await saasRuntime.startSubscription({
            subscriptionId,
            tenantId,
            productId: PRODUCT_ID,
            planId,
            status: "assisted_activation",
            currency,
            monthlyAmount,
            createdAt: at,
          });
        }
        if (subscription.status !== "active") {
          subscription = await saasRuntime.activateSubscription({ subscriptionId, activatedAt: at });
        }

        let entitlement = await saasRuntime.getEntitlement(entitlementId);
        if (!entitlement) {
          entitlement = await saasRuntime.grantEntitlement({
            entitlementId,
            subscriptionId,
            tenantId,
            workspaceId,
            productId: PRODUCT_ID,
            capability: "workspace-access",
            status: "active",
            sourcePlanId: planId,
            createdAt: at,
          });
        }

        let provisioningJob = await saasRuntime.getProvisioningJob(provisioningJobId);
        if (!provisioningJob) {
          const enqueued = await saasRuntime.enqueueProvisioning({
            provisioningJobId,
            subscriptionId,
            tenantId,
            workspaceId,
            productId: PRODUCT_ID,
            entitlementIds: [entitlementId],
            idempotencyKey,
            requestedAt: at,
          });
          provisioningJob = enqueued.job;
        }
        if (provisioningJob.status === "queued") {
          provisioningJob = await saasRuntime.claimProvisioning({ provisioningJobId, at });
        }
        if (provisioningJob.status === "running") {
          provisioningJob = await saasRuntime.completeProvisioning({
            provisioningJobId,
            at,
            result: {
              tenantReady: true,
              workspaceReady: true,
              productReady: true,
              mode: "shared_saas_runtime",
            },
          });
        }
        if (provisioningJob.status !== "succeeded") {
          throw new Error("provisioning_not_ready");
        }

        const principal = await federatedPrincipal.resolveFederatedPrincipal({
          tenantId,
          provider: subjectProvider,
          externalSubject: subjectRef,
          subjectType: "checkout_subject_ref",
        });
        const accessGrantId = createAccessGrantId(tenantSlug, workspaceSlug, PRODUCT_ID, principal.principalId);
        let grant = await saasAccess.resolveActiveGrant({
          tenantId,
          principalId: principal.principalId,
          productId: PRODUCT_ID,
        });

        if (!grant.resolved) {
          const pendingGrant = await saasAccess.grantAccess({
            accessGrantId,
            principalId: principal.principalId,
            tenantId,
            workspaceId,
            productId: PRODUCT_ID,
            subscriptionId,
            entitlementId,
            requiredScopes: ["zuni:read", "zuni:reply"],
            grantedScopes: ["zuni:read", "zuni:reply"],
            status: "pending",
            createdAt: at,
          });
          const activeGrant = await saasAccess.activateAccess({
            accessGrantId: pendingGrant.accessGrantId,
            provisioningJobId,
            at,
          });
          grant = { resolved: true, grant: activeGrant };
        }

        await saasAccess.setOnboarding({
          tenantId,
          workspaceId,
          productId: PRODUCT_ID,
          status: "completed",
          requiredSteps: ["payment_approved", "provisioning_succeeded", "access_activated"],
          completedSteps: ["payment_approved", "provisioning_succeeded", "access_activated"],
          updatedAt: at,
        });

        return jsonResponse(201, {
          ok: true,
          provisioned: true,
          ...publicResult({
            tenantId,
            workspaceId,
            subscriptionId,
            entitlementId,
            provisioningJobId,
            principalId: principal.principalId,
            accessGrantId: grant.grant.accessGrantId,
            planId,
            status: "active",
          }),
        });
      } catch (error) {
        const message = String(error?.message ?? "");
        const reason =
          /required|invalid|must be|JSON|currency/i.test(message)
            ? "invalid_provision_request"
            : "provisioning_failed";
        return jsonResponse(reason === "invalid_provision_request" ? 400 : 409, {
          ok: false,
          reason,
        });
      }
    },
  });
}

export { PROVISION_SCOPE };
