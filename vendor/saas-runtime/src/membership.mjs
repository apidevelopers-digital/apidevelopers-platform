import { createDurableRepository } from "../../persistence-core/src/index.mjs";
import {
  createSaasUser,
  createRole,
  createMembership,
  createChatSession,
  assertMembershipRoleBinding,
  assertMembershipAccessGrantBinding,
  assertRolePermission,
  assertChatSessionAuthority,
} from "../../contracts/src/saas-membership.mjs";

function requireDependency(value, name) {
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}

function frozenFailure(reason, details = {}) {
  return Object.freeze({ opened: false, reason, ...details });
}

export function createMembershipRuntime({
  store,
  saasRuntime,
  accessRuntime,
  clock = () => new Date().toISOString(),
} = {}) {
  requireDependency(store, "store");
  requireDependency(saasRuntime, "saasRuntime");
  requireDependency(accessRuntime, "accessRuntime");

  if (typeof saasRuntime.getWorkspace !== "function") {
    throw new TypeError("saasRuntime.getWorkspace is required");
  }
  if (typeof accessRuntime.evaluateAccess !== "function") {
    throw new TypeError("accessRuntime.evaluateAccess is required");
  }

  const users = createDurableRepository({ store, collection: "saas.users", idField: "userId" });
  const roles = createDurableRepository({ store, collection: "saas.roles", idField: "roleId" });
  const memberships = createDurableRepository({ store, collection: "saas.memberships", idField: "membershipId" });
  const chatSessions = createDurableRepository({ store, collection: "saas.chatSessions", idField: "chatSessionId" });
  const grants = createDurableRepository({ store, collection: "saas.accessGrants", idField: "accessGrantId" });

  async function registerUser(input) {
    const user = createSaasUser(input);
    const current = await users.getById(user.userId);
    if (current) {
      if (current.principalId !== user.principalId) {
        throw new Error("user principal boundary mismatch");
      }
      return current;
    }
    return users.create(user);
  }

  async function registerRole(input) {
    const role = createRole(input);
    if (role.scope === "workspace") {
      const workspace = await saasRuntime.getWorkspace(role.workspaceId);
      if (!workspace) throw new Error("role workspace not found");
      if (workspace.tenantId !== role.tenantId) {
        throw new Error("role workspace tenant boundary mismatch");
      }
    }

    const current = await roles.getById(role.roleId);
    if (current) return current;
    return roles.create(role);
  }

  async function addMembership(input) {
    const membership = createMembership(input);
    const [workspace, user, role] = await Promise.all([
      saasRuntime.getWorkspace(membership.workspaceId),
      users.getById(membership.userId),
      roles.getById(membership.roleId),
    ]);

    if (!workspace) throw new Error("membership workspace not found");
    if (!user) throw new Error("membership user not found");
    if (!role) throw new Error("membership role not found");
    if (workspace.tenantId !== membership.tenantId) {
      throw new Error("membership workspace tenant boundary mismatch");
    }
    if (user.principalId !== membership.principalId || user.status !== "active") {
      throw new Error("membership user principal boundary mismatch");
    }
    assertMembershipRoleBinding(membership, role);

    const current = await memberships.getById(membership.membershipId);
    if (current) return current;
    return memberships.create(membership);
  }

  async function resolveActiveMembership({ tenantId, workspaceId, principalId } = {}) {
    if (!tenantId || !workspaceId || !principalId) {
      return Object.freeze({ resolved: false, reason: "membership_context_required", membership: null });
    }

    const matches = await memberships.list({
      where: { tenantId, workspaceId, principalId, status: "active" },
    });

    if (matches.length === 0) {
      return Object.freeze({ resolved: false, reason: "membership_not_found", membership: null });
    }
    if (matches.length !== 1) {
      return Object.freeze({ resolved: false, reason: "membership_ambiguous", membership: null });
    }

    return Object.freeze({ resolved: true, reason: null, membership: matches[0] });
  }

  async function openChatSession({
    identity,
    chatSessionId,
    tenantId,
    workspaceId,
    accessGrantId,
    productId,
    locale,
    requiredPermission = "chat:use",
    createdAt = clock(),
  } = {}) {
    const principalId = identity?.principal?.id;
    if (!principalId) return frozenFailure("principal_required");

    const resolved = await resolveActiveMembership({ tenantId, workspaceId, principalId });
    if (!resolved.resolved) return frozenFailure(resolved.reason);

    const membership = resolved.membership;
    const [user, role, grant, workspace] = await Promise.all([
      users.getById(membership.userId),
      roles.getById(membership.roleId),
      grants.getById(accessGrantId),
      saasRuntime.getWorkspace(workspaceId),
    ]);

    if (!user || user.status !== "active" || user.principalId !== principalId) {
      return frozenFailure("user_inactive_or_mismatched");
    }
    if (!role) return frozenFailure("role_not_found");
    if (!workspace || workspace.status !== "active") return frozenFailure("workspace_inactive_or_missing");
    if (workspace.tenantId !== tenantId || workspace.productId !== String(productId || "").trim().toLowerCase()) {
      return frozenFailure("workspace_context_mismatch");
    }
    if (!grant) return frozenFailure("access_grant_not_found");

    try {
      assertMembershipRoleBinding(membership, role);
      assertMembershipAccessGrantBinding(membership, grant);
      assertRolePermission(role, requiredPermission);
    } catch (error) {
      return frozenFailure("membership_authority_mismatch", { detail: error.message });
    }

    if (grant.productId !== String(productId || "").trim().toLowerCase()) {
      return frozenFailure("access_product_mismatch");
    }

    const access = await accessRuntime.evaluateAccess({
      identity,
      accessGrantId,
      tenantId,
      workspaceId,
      productId,
    });
    if (!access.allowed) {
      return frozenFailure(access.reason || "access_denied", {
        missingScopes: access.missingScopes ?? [],
      });
    }

    const session = createChatSession({
      chatSessionId,
      tenantId,
      workspaceId,
      principalId,
      userId: membership.userId,
      membershipId: membership.membershipId,
      roleId: membership.roleId,
      accessGrantId,
      productId,
      locale,
      status: "active",
      createdAt,
    });

    assertChatSessionAuthority(session, membership, role, grant);

    const current = await chatSessions.getById(session.chatSessionId);
    if (current) {
      assertChatSessionAuthority(current, membership, role, grant);
      return Object.freeze({ opened: true, reason: null, session: current });
    }

    const stored = await chatSessions.create(session);
    return Object.freeze({ opened: true, reason: null, session: stored });
  }

  return Object.freeze({
    registerUser,
    registerRole,
    addMembership,
    resolveActiveMembership,
    openChatSession,
    getUser: (id) => users.getById(id),
    getRole: (id) => roles.getById(id),
    getMembership: (id) => memberships.getById(id),
    getChatSession: (id) => chatSessions.getById(id),
    listMemberships: (where = {}) => memberships.list({ where }),
    listChatSessions: (where = {}) => chatSessions.list({ where }),
  });
}
