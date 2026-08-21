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
const tenant = "component.tenant.acme";
const workspace = "component.workspace.acme.uni-main";
const principal = "principal-1";
const user = "component.user.principal-1";
const roleId = "component.role.acme.uni-main.member";
const membershipId = "component.membership.acme.uni-main.principal-1";
const grantId = "component.access.acme.uni-main.unico.principal-1";

function makeRole(overrides = {}) {
  return createRole({
    roleId, tenantId: tenant, workspaceId: workspace, scope: "workspace",
    key: "member", permissions: ["chat:use"], status: "active", createdAt: T0,
    ...overrides,
  });
}

function makeMembership(overrides = {}) {
  return createMembership({
    membershipId, tenantId: tenant, workspaceId: workspace, userId: user,
    principalId: principal, roleId, status: "active", createdAt: T0,
    ...overrides,
  });
}

function makeGrant(overrides = {}) {
  return {
    accessGrantId: grantId, tenantId: tenant, workspaceId: workspace,
    principalId: principal, productId: "uni.co", status: "active",
    ...overrides,
  };
}

test("membership and role must be active", () => {
  assert.throws(
    () => assertMembershipRoleBinding(makeMembership({ status: "suspended" }), makeRole()),
    /membership must be active/,
  );
  assert.throws(
    () => assertMembershipRoleBinding(makeMembership(), makeRole({ status: "revoked" })),
    /role must be active/,
  );
});

test("role boundary and chat permission fail closed", () => {
  assert.throws(
    () => assertMembershipRoleBinding(makeMembership(), makeRole({ tenantId: "component.tenant.beta" })),
    /membership role boundary mismatch/,
  );
  assert.throws(
    () => assertMembershipRoleBinding(makeMembership(), makeRole({ workspaceId: "component.workspace.beta.uni-main" })),
    /membership workspace role boundary mismatch/,
  );
  assert.throws(
    () => assertRolePermission(makeRole({ permissions: [] }), "chat:use"),
    /role permission missing/,
  );
});

test("access grant must be active and match tenant, workspace and principal", () => {
  assert.throws(
    () => assertMembershipAccessGrantBinding(makeMembership(), makeGrant({ status: "revoked" })),
    /access grant must be active/,
  );
  for (const [field, value] of [
    ["tenantId", "component.tenant.beta"],
    ["workspaceId", "component.workspace.beta.uni-main"],
    ["principalId", "principal-2"],
  ]) {
    assert.throws(
      () => assertMembershipAccessGrantBinding(makeMembership(), makeGrant({ [field]: value })),
      new RegExp(`membership access ${field} mismatch`),
    );
  }
});

test("chat session pins governed authority", () => {
  const membership = makeMembership();
  const role = makeRole();
  const grant = makeGrant();
  const session = createChatSession({
    chatSessionId: "component.chat-session.acme.uni-main.chat-1",
    tenantId: tenant, workspaceId: workspace, principalId: principal,
    userId: user, membershipId, roleId, accessGrantId: grantId,
    productId: "uni.co", locale: "pt-BR", status: "active", createdAt: T0,
  });

  assert.equal(assertChatSessionAuthority(session, membership, role, grant), true);
  assert.throws(
    () => assertChatSessionAuthority({ ...session, tenantId: "component.tenant.beta" }, membership, role, grant),
    /chat session tenantId authority mismatch/,
  );
  assert.throws(
    () => assertChatSessionAuthority({ ...session, accessGrantId: "component.access.beta.uni-main.unico.principal-1" }, membership, role, grant),
    /chat session accessGrantId authority mismatch/,
  );
});
