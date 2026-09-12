import { authorize } from "@apidevelopers/auth-core";

export const UNIJURI_ACCESS_WRITE_SCOPE = "saas:uni-juri:access:write";
export const UNIJURI_ACCESS_WRITE_APPROVAL = "IGOR_APROVA_UNIJURI_ACCESS_PROVISIONING_V1";

export function createUniJuriAccessGrantWriter({ authenticator, runtime, audit, writeEnabled = false } = {}) {
  if (typeof authenticator?.authenticate !== "function") throw new TypeError("authenticator required");
  if (typeof audit !== "function") throw new TypeError("audit required");
  return Object.freeze({
    async provision({ headers = {}, approval, binding = {} } = {}) {
      const actor = await authenticator.authenticate(headers);
      if (!actor) return Object.freeze({ ok: false, status: 401, reason: "unauthorized", writesExecuted: false });
      const decision = authorize(actor, { scopes: [UNIJURI_ACCESS_WRITE_SCOPE] });
      if (!decision.allowed) return Object.freeze({ ok: false, status: 403, reason: "scope_forbidden", writesExecuted: false });
      if (writeEnabled !== true) return Object.freeze({ ok: false, status: 423, reason: "write_disabled", writesExecuted: false });
      if (approval !== UNIJURI_ACCESS_WRITE_APPROVAL) return Object.freeze({ ok: false, status: 403, reason: "approval_required", writesExecuted: false });
      if (binding.productId !== "uni-juri") return Object.freeze({ ok: false, status: 400, reason: "product_mismatch", writesExecuted: false });

      const required = ["tenantId","workspaceId","subscriptionId","entitlementId","provisioningJobId","accessGrantId","principalId"];
      if (required.some((key) => !String(binding[key] ?? "").trim())) {
        return Object.freeze({ ok: false, status: 400, reason: "binding_context_required", writesExecuted: false });
      }
      const [tenant, workspace, subscription, entitlement, job] = await Promise.all([
        runtime.getTenant(binding.tenantId),
        runtime.getWorkspace(binding.workspaceId),
        runtime.getSubscription(binding.subscriptionId),
        runtime.getEntitlement(binding.entitlementId),
        runtime.getProvisioningJob(binding.provisioningJobId),
      ]);
      const valid = tenant?.status === "active" &&
        workspace?.status === "active" && workspace.tenantId === binding.tenantId && workspace.productId === "uni-juri" &&
        subscription?.status === "active" && subscription.tenantId === binding.tenantId && subscription.productId === "uni-juri" &&
        entitlement?.status === "active" && entitlement.subscriptionId === binding.subscriptionId &&
        entitlement.tenantId === binding.tenantId && entitlement.workspaceId === binding.workspaceId && entitlement.productId === "uni-juri" &&
        job?.status === "succeeded" && job.subscriptionId === binding.subscriptionId &&
        job.tenantId === binding.tenantId && job.workspaceId === binding.workspaceId && job.productId === "uni-juri";
      if (!valid) return Object.freeze({ ok: false, status: 409, reason: "commercial_context_not_ready", writesExecuted: false });

      const at = new Date().toISOString();
      const scopes = Object.freze(["use_product"]);
      const grant = await runtime.grantAccess({ ...binding, requiredScopes: scopes, grantedScopes: scopes, status: "pending", createdAt: at });
      const active = grant.status === "active" ? grant : await runtime.activateAccess({
        accessGrantId: grant.accessGrantId,
        provisioningJobId: binding.provisioningJobId,
        at,
      });
      await audit(Object.freeze({ event: "saas.uni-juri.access.provisioned", accessGrantId: active.accessGrantId, principalId: binding.principalId, secretsExposed: false }));
      return Object.freeze({ ok: true, status: 201, accessGrantId: active.accessGrantId, writesExecuted: true, chargeExecuted: false, secretsExposed: false });
    },
  });
}
