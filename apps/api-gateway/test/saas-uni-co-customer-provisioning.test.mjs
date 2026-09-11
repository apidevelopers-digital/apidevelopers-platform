import assert from "node:assert/strict";
import test from "node:test";

import {
  createAccessGrantId,
  createTenantId,
  createWorkspaceId,
} from "@apidevelopers/contracts";
import {
  createUniCoCustomerProvisioningApp,
  uniCoCustomerProvisioningContract,
} from "../src/saas-uni-co-customer-provisioning.mjs";
import {
  UNI_CO_CUSTOMER_PERMISSIONS,
  UNI_CO_CUSTOMER_PRODUCT_ID,
} from "../src/saas-uni-co-customer-membership.mjs";

const TENANT_SLUG = "cliente-teste";
const WORKSPACE_SLUG = "principal";
const PRINCIPAL_KEY = "0123456789abcdef0123456789abcdef";
const TENANT_ID = createTenantId(TENANT_SLUG);
const WORKSPACE_ID = createWorkspaceId(TENANT_SLUG, WORKSPACE_SLUG);
const PRINCIPAL_ID = `component.principal.${PRINCIPAL_KEY}`;
const ACCESS_GRANT_ID = createAccessGrantId(
  TENANT_SLUG,
  WORKSPACE_SLUG,
  "uni-co",
  PRINCIPAL_KEY,
);
const NOW = "2026-09-11T20:00:00.000Z";

function membershipHarness() {
  const state = {
    user: null,
    role: null,
    membership: null,
    userWrites: 0,
    roleWrites: 0,
    membershipWrites: 0,
  };
  return {
    state,
    runtime: {
      async registerUser(input) {
        if (state.user) return state.user;
        state.userWrites += 1;
        state.user = Object.freeze({ ...input });
        return state.user;
      },
      async registerRole(input) {
        if (state.role) return state.role;
        state.roleWrites += 1;
        state.role = Object.freeze({ ...input });
        return state.role;
      },
      async addMembership(input) {
        if (state.membership) return state.membership;
        state.membershipWrites += 1;
        state.membership = Object.freeze({ ...input });
        return state.membership;
      },
    },
  };
}

function fixture({ grantResolved = true, baseStatus = 201 } = {}) {
  const membership = membershipHarness();
  const grant = Object.freeze({
    accessGrantId: ACCESS_GRANT_ID,
    principalId: PRINCIPAL_ID,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    productId: UNI_CO_CUSTOMER_PRODUCT_ID,
    status: "active",
  });
  const baseBody = baseStatus === 201
    ? {
        ok: true,
        provisioned: true,
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        principalId: PRINCIPAL_ID,
        accessGrantId: ACCESS_GRANT_ID,
        productId: UNI_CO_CUSTOMER_PRODUCT_ID,
        status: "active",
        billing: { mode: "internal-preview", currency: "BRL", monthlyAmount: 0 },
        secretsExposed: false,
      }
    : { ok: false, reason: "invalid_uni_co_provision_request", secretsExposed: false };

  let baseCalls = 0;
  let grantCalls = 0;
  const app = createUniCoCustomerProvisioningApp({
    provisioningApp: {
      async handleRequest() {
        baseCalls += 1;
        return Object.freeze({
          status: baseStatus,
          headers: Object.freeze({
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          }),
          body: JSON.stringify(baseBody),
        });
      },
    },
    saasRuntime: {
      async getTenant(id) {
        assert.equal(id, TENANT_ID);
        return Object.freeze({ tenantId: TENANT_ID, slug: TENANT_SLUG, status: "active" });
      },
      async getWorkspace(id) {
        assert.equal(id, WORKSPACE_ID);
        return Object.freeze({
          workspaceId: WORKSPACE_ID,
          tenantId: TENANT_ID,
          productId: UNI_CO_CUSTOMER_PRODUCT_ID,
          slug: WORKSPACE_SLUG,
          status: "active",
        });
      },
    },
    saasAccess: {
      async resolveActiveGrant(input) {
        grantCalls += 1;
        assert.deepEqual(input, {
          tenantId: TENANT_ID,
          principalId: PRINCIPAL_ID,
          productId: UNI_CO_CUSTOMER_PRODUCT_ID,
        });
        return grantResolved
          ? Object.freeze({ resolved: true, reason: null, grant })
          : Object.freeze({ resolved: false, reason: "access_grant_not_found", grant: null });
      },
    },
    membershipRuntime: membership.runtime,
    clock: () => NOW,
  });

  return {
    app,
    membership,
    get baseCalls() { return baseCalls; },
    get grantCalls() { return grantCalls; },
  };
}

const REQUEST = Object.freeze({
  method: "POST",
  url: "/v1/saas/uni-co/provision",
  headers: {},
  body: "{}",
});

test("customer provisioning contract stays upstream-authenticated and does not auto-login", () => {
  assert.equal(uniCoCustomerProvisioningContract.path, "/v1/saas/uni-co/provision");
  assert.equal(uniCoCustomerProvisioningContract.productId, "product:uni-co");
  assert.deepEqual(
    uniCoCustomerProvisioningContract.completes,
    ["saas_user", "customer_role", "membership"],
  );
  assert.equal(uniCoCustomerProvisioningContract.humanSessionRequiredUpstream, true);
  assert.equal(uniCoCustomerProvisioningContract.automaticLoginProvisioning, false);
  assert.equal(uniCoCustomerProvisioningContract.productionWriteAuthorized, false);
});

test("201 provisioning becomes accountReady only after active customer membership is bound", async () => {
  const fx = fixture();
  const response = await fx.app.handleRequest(REQUEST);
  const body = JSON.parse(response.body);

  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  assert.equal(body.provisioned, true);
  assert.equal(body.accountReady, true);
  assert.equal(body.productId, "product:uni-co");
  assert.equal(body.account.humanSessionRequiredUpstream, true);
  assert.equal(body.account.automaticLoginProvisioning, false);
  assert.equal(body.account.productionWriteAuthorized, false);
  assert.deepEqual(body.account.permissions, UNI_CO_CUSTOMER_PERMISSIONS);
  assert.equal(fx.membership.state.user.principalId, PRINCIPAL_ID);
  assert.equal(fx.membership.state.role.key, "customer");
  assert.equal(fx.membership.state.membership.principalId, PRINCIPAL_ID);
  assert.equal(fx.membership.state.membership.roleId, fx.membership.state.role.roleId);
  assert.equal(fx.grantCalls, 1);
});

test("customer provisioning replay is idempotent for user, role and membership", async () => {
  const fx = fixture();
  const first = JSON.parse((await fx.app.handleRequest(REQUEST)).body);
  const replay = JSON.parse((await fx.app.handleRequest(REQUEST)).body);

  assert.equal(first.accountReady, true);
  assert.equal(replay.accountReady, true);
  assert.equal(first.account.userId, replay.account.userId);
  assert.equal(first.account.roleId, replay.account.roleId);
  assert.equal(first.account.membershipId, replay.account.membershipId);
  assert.equal(fx.membership.state.userWrites, 1);
  assert.equal(fx.membership.state.roleWrites, 1);
  assert.equal(fx.membership.state.membershipWrites, 1);
});

test("unresolved access grant fails closed after provisioning without creating membership", async () => {
  const fx = fixture({ grantResolved: false });
  const response = await fx.app.handleRequest(REQUEST);
  const body = JSON.parse(response.body);

  assert.equal(response.status, 409);
  assert.equal(body.ok, false);
  assert.equal(body.provisioned, true);
  assert.equal(body.accountReady, false);
  assert.equal(body.reason, "uni_co_customer_account_not_ready");
  assert.equal(body.humanSessionRequiredUpstream, true);
  assert.equal(body.automaticLoginProvisioning, false);
  assert.equal(body.productionWriteAuthorized, false);
  assert.equal(body.secretsExposed, false);
  assert.equal(fx.membership.state.userWrites, 0);
  assert.equal(fx.membership.state.roleWrites, 0);
  assert.equal(fx.membership.state.membershipWrites, 0);
});

test("non-201 base responses pass through and do not mutate customer membership", async () => {
  const fx = fixture({ baseStatus: 400 });
  const response = await fx.app.handleRequest(REQUEST);

  assert.equal(response.status, 400);
  assert.equal(fx.grantCalls, 0);
  assert.equal(fx.membership.state.userWrites, 0);
});
