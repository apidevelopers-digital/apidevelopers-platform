import assert from "node:assert/strict";
import test from "node:test";

import {
  createTenantId,
  createWorkspaceId,
} from "@apidevelopers/contracts";
import {
  ensureUniCoCustomerMembership,
  UNI_CO_CUSTOMER_PERMISSIONS,
  UNI_CO_CUSTOMER_PRODUCT_ID,
  UNI_CO_CUSTOMER_ROLE_KEY,
} from "../src/saas-uni-co-customer-membership.mjs";

const NOW = "2026-09-11T18:30:00.000Z";
const TENANT_SLUG = "cliente-teste";
const WORKSPACE_SLUG = "principal";
const TENANT_ID = createTenantId(TENANT_SLUG);
const WORKSPACE_ID = createWorkspaceId(TENANT_SLUG, WORKSPACE_SLUG);
const PRINCIPAL_ID = "component.principal.0123456789abcdef0123456789abcdef";

function activeGrant(overrides = {}) {
  return Object.freeze({
    accessGrantId: "component.access-grant.cliente-teste.principal.uni-co.0123456789abcdef0123456789abcdef",
    principalId: PRINCIPAL_ID,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    productId: UNI_CO_CUSTOMER_PRODUCT_ID,
    status: "active",
    ...overrides,
  });
}

function harness({ roleTransform } = {}) {
  const state = {
    user: null,
    role: null,
    membership: null,
    userWrites: 0,
    roleWrites: 0,
    membershipWrites: 0,
  };

  const membershipRuntime = {
    async registerUser(input) {
      if (state.user) return state.user;
      state.userWrites += 1;
      state.user = Object.freeze({ ...input });
      return state.user;
    },
    async registerRole(input) {
      if (state.role) return state.role;
      state.roleWrites += 1;
      state.role = Object.freeze(roleTransform ? roleTransform(input) : { ...input });
      return state.role;
    },
    async addMembership(input) {
      if (state.membership) return state.membership;
      state.membershipWrites += 1;
      state.membership = Object.freeze({ ...input });
      return state.membership;
    },
  };

  return { state, membershipRuntime };
}

function input(membershipRuntime, overrides = {}) {
  return {
    membershipRuntime,
    tenantSlug: TENANT_SLUG,
    workspaceSlug: WORKSPACE_SLUG,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    principalId: PRINCIPAL_ID,
    accessGrant: activeGrant(),
    createdAt: NOW,
    ...overrides,
  };
}

test("customer membership creates canonical user, role and membership with media permissions", async () => {
  const { membershipRuntime } = harness();
  const result = await ensureUniCoCustomerMembership(input(membershipRuntime));

  assert.equal(result.productId, "product:uni-co");
  assert.equal(result.role.key, UNI_CO_CUSTOMER_ROLE_KEY);
  assert.equal(result.role.scope, "workspace");
  assert.deepEqual(result.role.permissions, UNI_CO_CUSTOMER_PERMISSIONS);
  assert.equal(result.user.principalId, PRINCIPAL_ID);
  assert.equal(result.membership.principalId, PRINCIPAL_ID);
  assert.equal(result.membership.roleId, result.role.roleId);
  assert.equal(result.membership.userId, result.user.userId);
  assert.equal(result.accessGrantId, activeGrant().accessGrantId);
  assert.equal(result.accountReady, true);
  assert.equal(result.humanSessionRequiredUpstream, true);
  assert.equal(result.productionWriteAuthorized, false);
});

test("customer membership replay is idempotent", async () => {
  const { membershipRuntime, state } = harness();

  const first = await ensureUniCoCustomerMembership(input(membershipRuntime));
  const replay = await ensureUniCoCustomerMembership(input(membershipRuntime));

  assert.equal(first.user.userId, replay.user.userId);
  assert.equal(first.role.roleId, replay.role.roleId);
  assert.equal(first.membership.membershipId, replay.membership.membershipId);
  assert.equal(state.userWrites, 1);
  assert.equal(state.roleWrites, 1);
  assert.equal(state.membershipWrites, 1);
});

test("customer membership fails closed for cross-tenant or inactive access grants", async () => {
  const { membershipRuntime } = harness();

  await assert.rejects(
    ensureUniCoCustomerMembership(input(membershipRuntime, {
      accessGrant: activeGrant({ tenantId: createTenantId("outro-cliente") }),
    })),
    /tenantId_mismatch/,
  );

  await assert.rejects(
    ensureUniCoCustomerMembership(input(membershipRuntime, {
      accessGrant: activeGrant({ status: "pending" }),
    })),
    /access_grant_not_active/,
  );
});

test("customer membership rejects a pre-existing customer role with weaker permissions", async () => {
  const { membershipRuntime } = harness({
    roleTransform: (role) => ({ ...role, permissions: ["web:chat"] }),
  });

  await assert.rejects(
    ensureUniCoCustomerMembership(input(membershipRuntime)),
    /customer_role_permissions_mismatch/,
  );
});
