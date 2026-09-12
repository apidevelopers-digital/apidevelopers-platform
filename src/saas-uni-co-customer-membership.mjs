import {
  assertCanonicalId,
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
  return value;
}

function canonicalPrincipalKey(principalId) {
  const parsed = assertCanonicalId(principalId, { expectedFamily: "component" });
  const [kind, key] = parsed.semanticSegments;
  if (kind !== "principal" || !key || parsed.semanticSegments.length !== 2) {
    throw new TypeError("principalId must be a canonical component.principal id");
  }
  return key;
}

function assertSamePermissions(actual, expected) {
  const left = [...new Set(Array.isArray(actual) ? actual : [])].sort();
  const right = [...new Set(expected)].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error("uni_co_customer_role_permissions_mismatch");
  }
}

function assertGrant({ accessGrant, tenantId, workspaceId, principalId }) {
  if (!accessGrant || typeof accessGrant !== "object") {
    throw new TypeError("accessGrant is required");
  }
  if (accessGrant.status !== "active") {
    throw new Error("uni_co_customer_access_grant_not_active");
  }
  if (accessGrant.productId !== UNI_CO_CUSTOMER_PRODUCT_ID) {
    throw new Error("uni_co_customer_access_product_mismatch");
  }
  for (const [field, expected] of Object.entries({ tenantId, workspaceId, principalId })) {
    if (accessGrant[field] !== expected) {
      throw new Error(`uni_co_customer_access_${field}_mismatch`);
    }
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

  const principalKey = canonicalPrincipalKey(principalId);
  assertGrant({ accessGrant, tenantId, workspaceId, principalId });

  const userId = createSaasUserId(principalKey);
  const roleId = createRoleId(tenantSlug, workspaceSlug, UNI_CO_CUSTOMER_ROLE_KEY);
  const membershipId = createMembershipId(tenantSlug, workspaceSlug, principalKey);

  const expectedUser = createSaasUser({
    userId,
    principalId,
    status: "active",
    createdAt,
  });
  const expectedRole = createRole({
    roleId,
    tenantId,
    workspaceId,
    scope: "workspace",
    key: UNI_CO_CUSTOMER_ROLE_KEY,
    permissions: UNI_CO_CUSTOMER_PERMISSIONS,
    status: "active",
    createdAt,
  });

  const user = await membershipRuntime.registerUser(expectedUser);
  if (user.userId !== userId || user.principalId !== principalId || user.status !== "active") {
    throw new Error("uni_co_customer_user_binding_mismatch");
  }

  const role = await membershipRuntime.registerRole(expectedRole);
  if (
    role.roleId !== roleId ||
    role.tenantId !== tenantId ||
    role.workspaceId !== workspaceId ||
    role.scope !== "workspace" ||
    role.key !== UNI_CO_CUSTOMER_ROLE_KEY ||
    role.status !== "active"
  ) {
    throw new Error("uni_co_customer_role_binding_mismatch");
  }
  assertSamePermissions(role.permissions, UNI_CO_CUSTOMER_PERMISSIONS);

  const expectedMembership = createMembership({
    membershipId,
    tenantId,
    workspaceId,
    userId,
    principalId,
    roleId,
    status: "active",
    createdAt,
  });
  const membership = await membershipRuntime.addMembership(expectedMembership);

  if (
    membership.membershipId !== membershipId ||
    membership.userId !== userId ||
    membership.principalId !== principalId ||
    membership.status !== "active"
  ) {
    throw new Error("uni_co_customer_membership_binding_mismatch");
  }

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
