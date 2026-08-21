import { assertCanonicalId, createCanonicalId } from "./canonical-ids.mjs";

const STATUSES = Object.freeze(["active", "suspended", "revoked"]);
const CHAT_STATUSES = Object.freeze(["active", "closed"]);
const ROLE_SCOPES = Object.freeze(["tenant", "workspace"]);

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function requireComponentId(value, name) {
  requireText(value, name);
  assertCanonicalId(value, { expectedFamily: "component" });
  return value;
}

function requireIsoDate(value, name) {
  requireText(value, name);
  if (Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} must be an ISO-8601 date`);
  }
  return value;
}

function requireStatus(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new RangeError(`invalid ${name}`);
  }
  return value;
}

function uniqueTexts(values, name) {
  if (!Array.isArray(values)) {
    throw new TypeError(`${name} must be an array`);
  }
  return [...new Set(values.map((value) => requireText(value, name)))];
}

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

export const saasMembershipContractVersion = 1;

export function createSaasUser({
  userId,
  principalId,
  status = "active",
  createdAt = new Date().toISOString(),
} = {}) {
  return Object.freeze({
    schemaVersion: saasMembershipContractVersion,
    userId: requireComponentId(userId, "userId"),
    principalId: requireText(principalId, "principalId"),
    status: requireStatus(status, STATUSES, "user status"),
    createdAt: requireIsoDate(createdAt, "createdAt"),
  });
}

export function createRole({
  roleId,
  tenantId,
  workspaceId = null,
  scope = workspaceId ? "workspace" : "tenant",
  key,
  permissions = [],
  status = "active",
  createdAt = new Date().toISOString(),
} = {}) {
  requireStatus(scope, ROLE_SCOPES, "role scope");
  requireComponentId(roleId, "roleId");
  requireComponentId(tenantId, "tenantId");

  if (scope === "workspace") {
    requireComponentId(workspaceId, "workspaceId");
  } else if (workspaceId !== null && workspaceId !== undefined) {
    throw new Error("tenant role must not bind a workspaceId");
  }

  return Object.freeze({
    schemaVersion: saasMembershipContractVersion,
    roleId,
    tenantId,
    workspaceId: scope === "workspace" ? workspaceId : null,
    scope,
    key: requireText(key, "key").toLowerCase(),
    permissions: Object.freeze(uniqueTexts(permissions, "permission")),
    status: requireStatus(status, STATUSES, "role status"),
    createdAt: requireIsoDate(createdAt, "createdAt"),
  });
}

export function createMembership({
  membershipId,
  tenantId,
  workspaceId,
  userId,
  principalId,
  roleId,
  status = "active",
  createdAt = new Date().toISOString(),
} = {}) {
  return Object.freeze({
    schemaVersion: saasMembershipContractVersion,
    membershipId: requireComponentId(membershipId, "membershipId"),
    tenantId: requireComponentId(tenantId, "tenantId"),
    workspaceId: requireComponentId(workspaceId, "workspaceId"),
    userId: requireComponentId(userId, "userId"),
    principalId: requireText(principalId, "principalId"),
    roleId: requireComponentId(roleId, "roleId"),
    status: requireStatus(status, STATUSES, "membership status"),
    createdAt: requireIsoDate(createdAt, "createdAt"),
  });
}

export function createChatSession({
  chatSessionId,
  tenantId,
  workspaceId,
  principalId,
  userId,
  membershipId,
  roleId,
  accessGrantId,
  productId,
  locale,
  status = "active",
  createdAt = new Date().toISOString(),
} = {}) {
  return Object.freeze({
    schemaVersion: saasMembershipContractVersion,
    chatSessionId: requireComponentId(chatSessionId, "chatSessionId"),
    tenantId: requireComponentId(tenantId, "tenantId"),
    workspaceId: requireComponentId(workspaceId, "workspaceId"),
    principalId: requireText(principalId, "principalId"),
    userId: requireComponentId(userId, "userId"),
    membershipId: requireComponentId(membershipId, "membershipId"),
    roleId: requireComponentId(roleId, "roleId"),
    accessGrantId: requireComponentId(accessGrantId, "accessGrantId"),
    productId: requireText(productId, "productId").toLowerCase(),
    locale: requireText(locale, "locale"),
    status: requireStatus(status, CHAT_STATUSES, "chat session status"),
    createdAt: requireIsoDate(createdAt, "createdAt"),
  });
}

export function assertMembershipRoleBinding(membership, role) {
  requireObject(membership, "membership");
  requireObject(role, "role");

  if (membership.status !== "active") {
    throw new Error("membership must be active");
  }
  if (role.status !== "active") {
    throw new Error("role must be active");
  }
  if (membership.roleId !== role.roleId || membership.tenantId !== role.tenantId) {
    throw new Error("membership role boundary mismatch");
  }
  if (role.scope === "workspace" && membership.workspaceId !== role.workspaceId) {
    throw new Error("membership workspace role boundary mismatch");
  }
  return true;
}

export function assertMembershipAccessGrantBinding(membership, grant) {
  requireObject(membership, "membership");
  requireObject(grant, "grant");

  if (membership.status !== "active") {
    throw new Error("membership must be active");
  }
  if (grant.status !== "active") {
    throw new Error("access grant must be active");
  }
  for (const field of ["tenantId", "workspaceId", "principalId"]) {
    if (membership[field] !== grant[field]) {
      throw new Error(`membership access ${field} mismatch`);
    }
  }
  return true;
}

export function assertRolePermission(role, permission) {
  requireObject(role, "role");
  const required = requireText(permission, "permission");
  if (role.status !== "active" || !Array.isArray(role.permissions) || !role.permissions.includes(required)) {
    throw new Error("role permission missing");
  }
  return true;
}

export function assertChatSessionAuthority(session, membership, role, grant) {
  requireObject(session, "session");
  assertMembershipRoleBinding(membership, role);
  assertMembershipAccessGrantBinding(membership, grant);

  const expected = {
    tenantId: membership.tenantId,
    workspaceId: membership.workspaceId,
    principalId: membership.principalId,
    userId: membership.userId,
    membershipId: membership.membershipId,
    roleId: membership.roleId,
    accessGrantId: grant.accessGrantId,
    productId: grant.productId,
  };

  for (const [field, value] of Object.entries(expected)) {
    if (session[field] !== value) {
      throw new Error(`chat session ${field} authority mismatch`);
    }
  }
  return true;
}

export function createSaasUserId(principalId) {
  return createCanonicalId({
    family: "component",
    segments: ["user", requireText(principalId, "principalId")],
  });
}

export function createRoleId(tenantSlug, workspaceSlug, key) {
  return createCanonicalId({
    family: "component",
    segments: ["role", requireText(tenantSlug, "tenantSlug"), requireText(workspaceSlug, "workspaceSlug"), requireText(key, "key")],
  });
}

export function createMembershipId(tenantSlug, workspaceSlug, principalId) {
  return createCanonicalId({
    family: "component",
    segments: ["membership", requireText(tenantSlug, "tenantSlug"), requireText(workspaceSlug, "workspaceSlug"), requireText(principalId, "principalId")],
  });
}

export function createChatSessionId(tenantSlug, workspaceSlug, sessionKey) {
  return createCanonicalId({
    family: "component",
    segments: ["chat-session", requireText(tenantSlug, "tenantSlug"), requireText(workspaceSlug, "workspaceSlug"), requireText(sessionKey, "sessionKey")],
  });
}

export {
  STATUSES as saasMembershipStatuses,
  CHAT_STATUSES as chatSessionStatuses,
  ROLE_SCOPES as saasRoleScopes,
};
