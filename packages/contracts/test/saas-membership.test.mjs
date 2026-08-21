import test from "node:test";
import assert from "node:assert/strict";

import {
  createRole,
  createMembership,
  createChatSession,
  assertMembershipRoleBinding,
  assertMembershipAccessGrantBinding,
  assertRolePermission,
  assertChatSessionAuthority,
} from "../src/saas-membership.mjs";

const T0 = "2026-08-21T06:00:00.000Z";
const TENANT_A = "component.tenant.acme";
const TENANT_B = "component.tenant.beta";
const WORKSPACE_A = "component.workspace.acme.uni-main";
const WORKSPACE_B = "component.workspace.beta.uni-main";
const USER = "component.user.principal-1";
const PRINCIPAL = "principal-1";
const ROLE_A = "component.role.acme.uni-main.member";
const MEMBERSHIP_A = "component.membership.acme.uni-main.principal-1";
const GRANT_A = "component.access.acme.uni-main.unico.principal-1";
const CHAT_A = "component.chat-session.acme.uni-main.chat-1";

function role(overrides = {}) {
  return createRole({
    roleId: ROLE_A,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    scope: "workspace",
    key: "member",
    permissions: ["chat:use"],
    status: "active",
    createdAt: T0,
    ...overrides,
  });
}

function membership(overrides = {}) {
  return createMembership({
    membershipId: MEMBERSHIP_A,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    userId: USER,
    principalId: PRINCIPAL,
    roleId: ROLE_A,
    status: "active",
    createdAt: T0,
    ...overrides,
  });
}

function grant(overrides = {}) {
  return Object.freeze({
    accessGrantId: GRANT_A,
    principalId: PRINCIPAL,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    productId: "uni.co",
    status: "active",
    ...overrides,
  });
}

test("membership authority fails closed for inactive membership and role", () => {
  assert.throws(
    () => assertMembershipRoleBinding(membership({ status: "suspended" }), role()),
    /membership must be active/,
  );

  assert.throws(
    () => assertMembershipRoleBinding(membership(), role({ status: "revoked" })),
    /role must be active/,
  );
});

test("membership authority rejects cross-tenant and cross-workspace role binding", () => {
  assert.throws(
    () =>
      assertMembershipRoleBinding(
        membership(),
        role({ tenantId: TENANT_B }),
      ),
    /membership role boundary mismatch/,
  );

  assert.throws(
    () =>
      assertMembershipRoleBinding(
        membership(),
        role({
          workspaceId: WORKSPACE_B,
        }),
      ),
    /membership workspace role boundary mismatch/,
  );
});

test("access grant binding rejects inactive and divergent grants", () => {
  assert.throws(
    () => assertMembershipAccessGrantBinding(membership(), grant({ status: "revoked" })),
    /access grant must be active/,
  );

  assert.throws(
    () => assertMembershipAccessGrantBinding(membership(), grant({ tenantId: TENANT_B })),
    /membership access tenantId mismatch/,
  );

  assert.throws(
    () => assertMembershipAccessGrantBinding(membership(), grant({ workspaceId: WORKSPACE_B })),
    /membership access workspaceId mismatch/,
  );

  assert.throws(
    () => assertMembershipAccessGrantBinding((userId, "workspaceId"),
   /membership access principalId mismatch/,
  );
});

test("role permission is mandatory for chat use", () => {
  assert.equal(assertRolePermission(role(), "chat:use"), true);

  assert.throws(
    () => assertRolePermission(role({ permissions: [] }), "chat:use"),
    /role permission missing/,
  );
});

test("chat session fixes tenant, workspace, principal, membership, role, grant and product authority", () => {
  const activeRole = role();
  const activeMembership = membership();
  const activeGrant = grant();
  const session = createChatSession({
    chatSessionId: CHAT_A,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    principalId: PRINCIPAL,
    userId: USER,
    membershipId: MEMBERSHIP_A,
    roleId: ROLE_A,
    accessGrantId: GRANT_A,
    productId: "uni.co",
    locale: "pt-BR",
    status: "active",
    createdAt: T0,
  });

  assert.equal(
    assertChatSessionAuthority(session, activeMembership, activeRole, activeGrant),
    true,
  );

  assert.throws(
    () =>
      assertChatSessionAuthority(
        { ...session, tenantId: TENANT_B },
        activeMembership,
        activeRole,
        activeGrant,
      ),
    /chat session tenantId authority mismatch/,
  );

  assert.throws(
    () =>
      assertChatSessionAuthority(
        { ...session, accessGrantId: "component.access.beta.uni-main.unico.principal-1" },
        activeMembership,
        activeRole,
        activeGrant,
      ),
    /chat session accessGrantId authority mismatch/,
  );
});
