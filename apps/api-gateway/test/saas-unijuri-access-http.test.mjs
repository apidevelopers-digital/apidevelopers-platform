import test from "node:test";
import assert from "node:assert/strict";

import {
  createUniJuriAccessHttpApp,
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
  return {
    async getTenant() { return { status: "active" }; },
    async getWorkspace() { return { status: "active", tenantId: "tenant", productId: "uni-juri" }; },
    async getSubscription() { return { status: "active", tenantId: "tenant", productId: "uni-juri" }; },
    async getEntitlement() {
      return { status: "active", subscriptionId: "subscription", tenantId: "tenant", workspaceId: "workspace", productId: "uni-juri" };
    },
    async getProvisioningJob() {
      return { status: "succeeded", subscriptionId: "subscription", tenantId: "tenant", workspaceId: "workspace", productId: "uni-juri" };
    },
    async grantAccess(input) { return { ...input, status: "pending" }; },
    async activateAccess({ accessGrantId }) { return { accessGrantId, status: "active" }; },
  };
}

const binding = {
  tenantId: "tenant",
  workspaceId: "workspace",
  subscriptionId: "subscription",
  entitlementId: "entitlement",
  provisioningJobId: "job",
  accessGrantId: "grant",
  principalId: "principal",
  productId: "uni-juri",
};

test("UniJuri access route remains fail-closed when access writes are disabled", async () => {
  const app = createUniJuriAccessHttpApp({ authenticator: auth, runtime: runtime(), audit: async () => {}, writeEnabled: false });
  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/uni-juri/access/provision",
    body: { approval: UNIJURI_ACCESS_WRITE_APPROVAL, productionApproval: "IGOR_APROVA_UNIJURI_ACCESS_REAL_20260913", binding },
  });
  assert.equal(response.status, 423);
  const body = JSON.parse(response.body);
  assert.equal(body.reason, "write_disabled");
  assert.equal(body.writesExecuted, false);
});

test("UniJuri access route provisions through the permanent governed writer when enabled", async () => {
  let audited = false;
  const app = createUniJuriAccessHttpApp({ authenticator: auth, runtime: runtime(), audit: async () => { audited = true; }, writeEnabled: true });
  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/uni-juri/access/provision",
    body: { approval: UNIJURI_ACCESS_WRITE_APPROVAL, binding },
  });
  assert.equal(response.status, 201);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.accessGrantId, binding.accessGrantId);
  assert.equal(body.writesExecuted, true);
  assert.equal(body.chargeExecuted, false);
  assert.equal(body.secretsExposed, false);
  assert.equal(audited, true);
});
