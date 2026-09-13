import {
  assertMembershipAccessGrantBinding,
  assertMembershipRoleBinding,
  createMembership,
  createMembershipId,
  createRole,
  createRoleId,
  createSaasUser,
  createSaasUserId,
} from "@apidevelopers/contracts";

export const UNI_CO_CUSTOMER_PRODUCT_ID = "product:uni-co";
export const UNI_CO_CUSTOMER_ROLE_KEY = "customer";
export const UNI_CO_CUSTOMER_PERMISSIONS = Object.freeze([
  "web:chat",
  "files.read",
  "files.write",
  "campaigns.read",
  "campaigns.write",
  "assets.read",
  "assets.publish",
  "analytics.read",
]);

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}

function principalKeyOf(principalId) {
  const match = String(principalId ?? "").trim().match(/^component\.principal\.([^:]+)$/);
  if (!match) throw new TypeError("principalId must be a canonical component.principal id");
  return match[1];
}

function assertGrant({ accessGrant, tenantId, workspaceId, principalId }) {
  if (!accessGrant || typeof accessGrant !== "object") throw new TypeError("accessGrant is required");
  if (accessGrant.status !== "active") throw new Error("uni_co_customer_access_grant_not_active");
  if (accessGrant.productId !== UNI_CO_CUSTOMER_PRODUCT_ID) throw new Error("uni_co_customer_access_product_mismatch");
  for (const [field, expected] of Object.entries({ tenantId, workspaceId, principalId })) {
    if (accessGrant[field] !== expected) throw new Error(`uni_co_customer_access_${field}_mismatch`);
  }
}

function sameStringSet(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const a = [...new Set(left.map((value) => String(value).trim()).filter(Boolean))].sort();
  const b = [...new Set(right.map((value) => String(value).trim()).filter(Boolean))].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function assertCustomerRole(role) {
  if (!role || typeof role !== "object") throw new TypeError("role is required");
  if (role.key !== UNI_CO_CUSTOMER_ROLE_KEY) throw new Error("uni_co_customer_role_key_mismatch");
  if (role.scope !== "workspace") throw new Error("uni_co_customer_role_scope_mismatch");
  if (role.status !== "active") throw new Error("uni_co_customer_role_not_active");
  if (!sameStringSet(role.permissions, UNI_CO_CUSTOMER_PERMISSIONS)) {
    throw new Error("uni_co_customer_role_permissions_mismatch");
  }
}

export async function ensureUniCoCustomerMembership({
  membershipRuntime,
  tenantSlug,
  workspaceSlug,
  tenantId,
  workspaceId,
  principalId,
  accessGrant,
  createdAt = new Date().toISOString(),
} = {}) {
  tenantSlug = requireText(tenantSlug, "tenantSlug");
  workspaceSlug = requireText(workspaceSlug, "workspaceSlug");
  tenantId = requireText(tenantId, "tenantId");
  workspaceId = requireText(workspaceId, "workspaceId");
  principalId = requireText(principalId, "principalId");
  requireFunction(membershipRuntime?.registerUser, "membershipRuntime.registerUser");
  requireFunction(membershipRuntime?.registerRole, "membershipRuntime.registerRole");
  requireFunction(membershipRuntime?.addMembership, "membershipRuntime.addMembership");
  assertGrant({ accessGrant, tenantId, workspaceId, principalId });

  const principalKey = principalKeyOf(principalId);
  const userId = createSaasUserId(principalKey);
  const roleId = createRoleId(tenantSlug, workspaceSlug, UNI_CO_CUSTOMER_ROLE_KEY);
  const membershipId = createMembershipId(tenantSlug, workspaceSlug, principalKey);

  const user = await membershipRuntime.registerUser(createSaasUser({
    userId,
    principalId,
    status: "active",
    createdAt,
  }));
  const role = await membershipRuntime.registerRole(createRole({
    roleId,
    tenantId,
    workspaceId,
    scope: "workspace",
    key: UNI_CO_CUSTOMER_ROLE_KEY,
    permissions: UNI_CO_CUSTOMER_PERMISSIONS,
    status: "active",
    createdAt,
  }));
  assertCustomerRole(role);
  const membership = await membershipRuntime.addMembership(createMembership({
    membershipId,
    tenantId,
    workspaceId,
    userId,
    principalId,
    roleId,
    status: "active",
    createdAt,
  }));

  assertMembershipRoleBinding(membership, role);
  assertMembershipAccessGrantBinding(membership, accessGrant);

  return Object.freeze({
    productId: UNI_CO_CUSTOMER_PRODUCT_ID,
    user,
    role,
    membership,
    accessGrantId: accessGrant.accessGrantId,
    permissions: UNI_CO_CUSTOMER_PERMISSIONS,
    accountReady: true,
    humanSessionRequiredUpstream: true,
    productionWriteAuthorized: false,
  });
}
