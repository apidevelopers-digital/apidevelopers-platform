import { ensureUniCoCustomerMembership, UNI_CO_CUSTOMER_PRODUCT_ID } from "./saas-uni-co-customer-membership.mjs";

const ROUTE = "/v1/saas/uni-co/provision";

function pathnameOf(url) {
  return new URL(String(url ?? "/"), "http://api-gateway.local").pathname;
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  return value;
}

function parseJsonBody(response) {
  const parsed = JSON.parse(String(response?.body ?? ""));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("provisioning response body must be an object");
  }
  return parsed;
}

function replyLike(response, status, payload) {
  return Object.freeze({
    status,
    headers: response?.headers ?? Object.freeze({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    }),
    body: JSON.stringify(payload),
  });
}

function assertProvisionedBinding(body) {
  if (body?.ok !== true || body?.provisioned !== true) throw new Error("uni_co_provisioning_not_complete");
  if (body?.productId !== UNI_CO_CUSTOMER_PRODUCT_ID) throw new Error("uni_co_product_mismatch");
  for (const field of ["tenantId", "workspaceId", "principalId", "accessGrantId"]) {
    if (typeof body?.[field] !== "string" || !body[field].trim()) {
      throw new Error(`uni_co_${field}_required`);
    }
  }
}

export function createUniCoCustomerProvisioningApp({
  provisioningApp,
  saasRuntime,
  saasAccess,
  membershipRuntime,
  clock = () => new Date().toISOString(),
} = {}) {
  requireFunction(provisioningApp?.handleRequest, "provisioningApp.handleRequest");
  requireFunction(saasRuntime?.getTenant, "saasRuntime.getTenant");
  requireFunction(saasRuntime?.getWorkspace, "saasRuntime.getWorkspace");
  requireFunction(saasAccess?.resolveActiveGrant, "saasAccess.resolveActiveGrant");
  requireFunction(membershipRuntime?.registerUser, "membershipRuntime.registerUser");
  requireFunction(membershipRuntime?.registerRole, "membershipRuntime.registerRole");
  requireFunction(membershipRuntime?.addMembership, "membershipRuntime.addMembership");

  return Object.freeze({
    async handleRequest(request = {}) {
      const response = await provisioningApp.handleRequest(request);
      const method = String(request.method ?? "GET").toUpperCase();
      if (method !== "POST" || pathnameOf(request.url) !== ROUTE || response?.status !== 201) {
        return response;
      }

      let body = null;
      try {
        body = parseJsonBody(response);
        assertProvisionedBinding(body);

        const [tenant, workspace, resolvedGrant] = await Promise.all([
          saasRuntime.getTenant(body.tenantId),
          saasRuntime.getWorkspace(body.workspaceId),
          saasAccess.resolveActiveGrant({
            tenantId: body.tenantId,
            principalId: body.principalId,
            productId: UNI_CO_CUSTOMER_PRODUCT_ID,
          }),
        ]);

        if (!tenant || tenant.status !== "active" || tenant.tenantId !== body.tenantId) {
          throw new Error("uni_co_customer_tenant_not_active");
        }
        if (
          !workspace ||
          workspace.status !== "active" ||
          workspace.workspaceId !== body.workspaceId ||
          workspace.tenantId !== body.tenantId ||
          workspace.productId !== UNI_CO_CUSTOMER_PRODUCT_ID
        ) {
          throw new Error("uni_co_customer_workspace_not_active");
        }
        if (
          resolvedGrant?.resolved !== true ||
          !resolvedGrant.grant ||
          resolvedGrant.grant.accessGrantId !== body.accessGrantId
        ) {
          throw new Error("uni_co_customer_access_grant_not_resolved");
        }

        const account = await ensureUniCoCustomerMembership({
          membershipRuntime,
          tenantSlug: tenant.slug,
          workspaceSlug: workspace.slug,
          tenantId: body.tenantId,
          workspaceId: body.workspaceId,
          principalId: body.principalId,
          accessGrant: resolvedGrant.grant,
          createdAt: clock(),
        });

        return replyLike(response, 201, {
          ...body,
          accountReady: true,
          account: {
            userId: account.user.userId,
            roleId: account.role.roleId,
            membershipId: account.membership.membershipId,
            permissions: account.permissions,
            humanSessionRequiredUpstream: true,
            automaticLoginProvisioning: false,
            productionWriteAuthorized: false,
          },
          secretsExposed: false,
        });
      } catch {
        return replyLike(response, 409, {
          ok: false,
          provisioned: body?.provisioned === true,
          accountReady: false,
          productId: UNI_CO_CUSTOMER_PRODUCT_ID,
          reason: "uni_co_customer_account_not_ready",
          humanSessionRequiredUpstream: true,
          automaticLoginProvisioning: false,
          productionWriteAuthorized: false,
          secretsExposed: false,
        });
      }
    },
  });
}

export const uniCoCustomerProvisioningContract = Object.freeze({
  path: ROUTE,
  productId: UNI_CO_CUSTOMER_PRODUCT_ID,
  completes: Object.freeze(["saas_user", "customer_role", "membership"]),
  humanSessionRequiredUpstream: true,
  automaticLoginProvisioning: false,
  productionWriteAuthorized: false,
});
