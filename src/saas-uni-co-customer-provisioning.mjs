import { ensureUniCoCustomerMembership, UNI_CO_CUSTOMER_PRODUCT_ID } from "./saas-uni-co-customer-membership.mjs";

const ROUTE = "/v1/saas/uni-co/provision";

const SAFE_CUSTOMER_PROVISIONING_REASONS = Object.freeze(new Set([
  "uni_co_provisioning_not_complete",
  "uni_co_product_mismatch",
  "uni_co_tenantId_required",
  "uni_co_workspaceId_required",
  "uni_co_principalId_required",
  "uni_co_accessGrantId_required",
  "uni_co_customer_tenant_not_active",
  "uni_co_customer_workspace_not_active",
  "uni_co_customer_access_grant_not_resolved",
  "uni_co_customer_membership_failed",
  "uni_co_customer_account_not_ready",
]));

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

function parseRequestBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  try {
    const parsed = JSON.parse(String(body ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
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

function expectedProductIdFromRequest(request) {
  const requested = String(parseRequestBody(request?.body).productId ?? "").trim();
  return requested || UNI_CO_CUSTOMER_PRODUCT_ID;
}

function safeCustomerProvisioningReason(error) {
  const code = String(error?.message ?? "").trim();
  return SAFE_CUSTOMER_PROVISIONING_REASONS.has(code)
    ? code
    : "uni_co_customer_account_not_ready";
}

function diagnosticPresence(body) {
  return Object.freeze({
    tenantIdPresent: typeof body?.tenantId === "string" && body.tenantId.trim().length > 0,
    workspaceIdPresent: typeof body?.workspaceId === "string" && body.workspaceId.trim().length > 0,
    principalIdPresent: typeof body?.principalId === "string" && body.principalId.trim().length > 0,
    accessGrantIdPresent: typeof body?.accessGrantId === "string" && body.accessGrantId.trim().length > 0,
  });
}

function assertProvisionedBinding(body, expectedProductId = UNI_CO_CUSTOMER_PRODUCT_ID) {
  if (body?.ok !== true || body?.provisioned !== true) throw new Error("uni_co_provisioning_not_complete");
  if (body?.productId !== expectedProductId) throw new Error("uni_co_product_mismatch");
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

      const expectedProductId = expectedProductIdFromRequest(request);
      let body = null;
      try {
        body = parseJsonBody(response);
        assertProvisionedBinding(body, expectedProductId);

        const [tenant, workspace, resolvedGrant] = await Promise.all([
          saasRuntime.getTenant(body.tenantId),
          saasRuntime.getWorkspace(body.workspaceId),
          saasAccess.resolveActiveGrant({
            tenantId: body.tenantId,
            principalId: body.principalId,
            productId: expectedProductId,
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
          workspace.productId !== expectedProductId
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

        let account;
        try {
          account = await ensureUniCoCustomerMembership({
            membershipRuntime,
            tenantSlug: tenant.slug,
            workspaceSlug: workspace.slug,
            tenantId: body.tenantId,
            workspaceId: body.workspaceId,
            principalId: body.principalId,
            accessGrant: resolvedGrant.grant,
            productId: expectedProductId,
            createdAt: clock(),
          });
        } catch {
          throw new Error("uni_co_customer_membership_failed");
        }

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
          diagnostic: Object.freeze({
            tenant: "active",
            workspace: "active",
            accessGrant: "resolved",
            membership: "ready",
          }),
          secretsExposed: false,
        });
      } catch (error) {
        const reason = safeCustomerProvisioningReason(error);
        return replyLike(response, 409, {
          ok: false,
          provisioned: body?.provisioned === true,
          accountReady: false,
          productId: expectedProductId,
          reason,
          diagnosticStage: reason,
          diagnostic: diagnosticPresence(body),
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
  supportedProductIds: Object.freeze([UNI_CO_CUSTOMER_PRODUCT_ID, "product:mitra"]),
  completes: Object.freeze(["saas_user", "customer_role", "membership"]),
  humanSessionRequiredUpstream: true,
  automaticLoginProvisioning: false,
  productionWriteAuthorized: false,
  diagnosticFailureReasons: Object.freeze([...SAFE_CUSTOMER_PROVISIONING_REASONS]),
});
