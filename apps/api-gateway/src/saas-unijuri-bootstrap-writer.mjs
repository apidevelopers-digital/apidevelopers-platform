import { authorize } from "@apidevelopers/auth-core";
import {
  createCanonicalId,
  createTenantId,
  createWorkspaceId,
  createSubscriptionId,
  createEntitlementId,
  createProvisioningJobId,
} from "@apidevelopers/contracts";

export const UNIJURI_BOOTSTRAP_SCOPE = "saas:uni-juri:bootstrap:write";
export const UNIJURI_BOOTSTRAP_APPROVAL = "IGOR_APROVA_UNIJURI_BOOTSTRAP_V1";
const PRODUCT_ID = "uni-juri";
const HEX64 = /^[a-f0-9]{64}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function required(value, name) {
  const out = String(value ?? "").trim();
  if (!out) throw new TypeError(`${name}_required`);
  return out;
}
function slug(value, name) {
  const out = required(value, name).toLowerCase();
  if (!SLUG.test(out)) throw new TypeError(`${name}_invalid`);
  return out;
}
function assertSame(actual, expected, code) {
  if (actual !== expected) throw new Error(code);
}

export function createUniJuriBootstrapWriter({
  authenticator,
  saasRuntime,
  federatedPrincipal,
  audit = async () => {},
  writeEnabled = false,
  clock = () => new Date().toISOString(),
} = {}) {
  if (typeof authenticator?.authenticate !== "function") throw new TypeError("authenticator_required");
  if (!saasRuntime) throw new TypeError("saasRuntime_required");
  if (typeof federatedPrincipal?.resolveFederatedPrincipal !== "function") throw new TypeError("federatedPrincipal_required");

  return Object.freeze({
    async bootstrap({ headers = {}, approval, input = {} } = {}) {
      const actor = await authenticator.authenticate(headers);
      if (!actor) return { ok: false, status: 401, reason: "unauthorized", writesExecuted: false };
      const decision = authorize(actor, { scopes: [UNIJURI_BOOTSTRAP_SCOPE] });
      if (!decision.allowed) return { ok: false, status: 403, reason: "scope_forbidden", writesExecuted: false };
      if (writeEnabled !== true) return { ok: false, status: 423, reason: "write_disabled", writesExecuted: false };
      if (approval !== UNIJURI_BOOTSTRAP_APPROVAL) return { ok: false, status: 423, reason: "approval_required", writesExecuted: false };

      const tenantSlug = slug(input.tenantSlug, "tenantSlug");
      const workspaceSlug = slug(input.workspaceSlug ?? "uni-juri-main", "workspaceSlug");
      const displayName = required(input.displayName, "displayName");
      const planId = slug(input.planId ?? "internal", "planId");
      const subjectRef = required(input.subjectRef, "subjectRef").toLowerCase();
      if (!HEX64.test(subjectRef)) throw new TypeError("subjectRef_invalid");
      const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
      const at = clock();

      const tenantId = createTenantId(tenantSlug);
      const workspaceId = createWorkspaceId(tenantSlug, workspaceSlug);
      const subscriptionId = createSubscriptionId(tenantSlug, PRODUCT_ID);
      const entitlementId = createEntitlementId(tenantSlug, workspaceSlug, "use-product");
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
          displayName: `${displayName} · UniJuri`,
          status: "active",
          createdAt: at,
        },
      });

      let subscription = await saasRuntime.getSubscription(subscriptionId);
      if (subscription) {
        assertSame(subscription.productId, PRODUCT_ID, "subscription_binding_mismatch");
        assertSame(subscription.tenantId, tenantId, "subscription_binding_mismatch");
      } else {
        subscription = await saasRuntime.startSubscription({
          subscriptionId, tenantId, productId: PRODUCT_ID, planId,
          status: "assisted_activation", currency: "BRL", monthlyAmount: 0, createdAt: at,
        });
      }
      if (subscription.status !== "active") {
        subscription = await saasRuntime.activateSubscription({ subscriptionId, activatedAt: at });
      }

      let entitlement = await saasRuntime.getEntitlement(entitlementId);
      if (entitlement) {
        assertSame(entitlement.subscriptionId, subscriptionId, "entitlement_binding_mismatch");
        assertSame(entitlement.workspaceId, workspaceId, "entitlement_binding_mismatch");
        assertSame(entitlement.productId, PRODUCT_ID, "entitlement_binding_mismatch");
      } else {
        entitlement = await saasRuntime.grantEntitlement({
          entitlementId, subscriptionId, tenantId, workspaceId, productId: PRODUCT_ID,
          capability: "use_product", status: "active", sourcePlanId: planId, createdAt: at,
        });
      }

      let job = await saasRuntime.getProvisioningJob(provisioningJobId);
      if (!job) {
        job = (await saasRuntime.enqueueProvisioning({
          provisioningJobId, subscriptionId, tenantId, workspaceId, productId: PRODUCT_ID,
          entitlementIds: [entitlementId], idempotencyKey, requestedAt: at,
        })).job;
      }
      if (job.status === "queued") job = await saasRuntime.claimProvisioning({ provisioningJobId, at });
      if (job.status === "running") {
        job = await saasRuntime.completeProvisioning({
          provisioningJobId, at,
          result: { tenantReady: true, workspaceReady: true, productReady: true, mode: "shared_saas_runtime" },
        });
      }
      if (job.status !== "succeeded") throw new Error("provisioning_not_ready");

      const principal = await federatedPrincipal.resolveFederatedPrincipal({
        tenantId,
        provider: "unico",
        externalSubject: subjectRef,
        subjectType: "unico_subject_ref",
      });

      await audit({
        action: "saas.uni-juri.bootstrap.provisioned",
        actor: actor.principal?.id ?? null,
        resource: tenantId,
        metadata: { tenantId, workspaceId, subscriptionId, entitlementId, provisioningJobId, principalId: principal.principalId },
      });

      return Object.freeze({
        ok: true, status: 201, productId: PRODUCT_ID,
        tenantId, workspaceId, subscriptionId, entitlementId, provisioningJobId,
        principalId: principal.principalId,
        writesExecuted: true, chargeExecuted: false, accessGrantCreated: false, secretsExposed: false,
      });
    },
  });
}
