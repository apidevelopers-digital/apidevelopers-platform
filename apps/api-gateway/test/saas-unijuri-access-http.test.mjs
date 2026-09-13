import test from "node:test";
import assert from "node:assert/strict";

import {
  createUniJuriAccessHttpApp,
  UNIJURI_ACCESS_ONE_TIME_PRODUCTION_APPROVAL,
  UNIJURI_ACCESS_ONE_TIME_PRODUCTION_BINDING,
  UNIJURI_ACCESS_WRITE_APPROVAL,
} from "../src/saas-unijuri-access-http.mjs";

const auth = {
  async authenticate() {
    return Object.freeze({
      role: "service",
      principal: Object.freeze({
        id: "platform-admin",
        status: "active",
        scopes: Object.freeze(["admin:*"]),
      }),
    });
  },
};

function runtime() {
  const binding = UNIJURI_ACCESS_ONE_TIME_PRODUCTION_BINDING;
  return {
    async getTenant() {
      return { status: "active" };
    },
    async getWorkspace() {
      return {
        status: "active",
        tenantId: binding.tenantId,
        productId: "uni-juri",
      };
    },
    async getSubscription() {
      return {
        status: "active",
        tenantId: binding.tenantId,
        productId: "uni-juri",
      };
    },
    async getEntitlement() {
      return {
        status: "active",
        subscriptionId: binding.subscriptionId,
        tenantId: binding.tenantId,
        workspaceId: binding.workspaceId,
        productId: "uni-juri",
      };
    },
    async getProvisioningJob() {
      return {
        status: "succeeded",
        subscriptionId: binding.subscriptionId,
        tenantId: binding.tenantId,
        workspaceId: binding.workspaceId,
        productId: "uni-juri",
      };
    },
    async grantAccess(input) {
      return { ...input, status: "pending" };
    },
    async activateAccess({ accessGrantId }) {
      return { accessGrantId, status: "active" };
    },
  };
}

function payload(overrides = {}) {
  return {
    approval: UNIJURI_ACCESS_WRITE_APPROVAL,
    productionApproval: UNIJURI_ACCESS_ONE_TIME_PRODUCTION_APPROVAL,
    binding: {
      ...UNIJURI_ACCESS_ONE_TIME_PRODUCTION_BINDING,
      ...overrides,
    },
  };
}

test("UniJuri access route remains fail-closed without exact production approval", async () => {
  const app = createUniJuriAccessHttpApp({
    authenticator: auth,
    runtime: runtime(),
    audit: async () => {},
    writeEnabled: false,
  });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/uni-juri/access/provision",
    body: { ...payload(), productionApproval: "WRONG" },
  });

  assert.equal(response.status, 423);
  const body = JSON.parse(response.body);
  assert.equal(body.reason, "write_disabled");
  assert.equal(body.writesExecuted, false);
});

test("UniJuri access route rejects one-time tuple drift", async () => {
  const app = createUniJuriAccessHttpApp({
    authenticator: auth,
    runtime: runtime(),
    audit: async () => {},
    writeEnabled: false,
  });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/uni-juri/access/provision",
    body: payload({ accessGrantId: "wrong" }),
  });

  assert.equal(response.status, 423);
  assert.equal(JSON.parse(response.body).writesExecuted, false);
});

test("UniJuri access route provisions exact governed one-time binding", async () => {
  let audited = false;
  const app = createUniJuriAccessHttpApp({
    authenticator: auth,
    runtime: runtime(),
    audit: async () => { audited = true; },
    writeEnabled: false,
  });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/uni-juri/access/provision",
    body: payload(),
  });

  assert.equal(response.status, 201);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.accessGrantId, UNIJURI_ACCESS_ONE_TIME_PRODUCTION_BINDING.accessGrantId);
  assert.equal(body.writesExecuted, true);
  assert.equal(body.chargeExecuted, false);
  assert.equal(body.secretsExposed, false);
  assert.equal(audited, true);
});
