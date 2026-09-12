import assert from "node:assert/strict";
import test from "node:test";

import { createGatewayAuthenticator } from "../src/auth-composition.mjs";
import { createSaasOperationalHttpComposition } from "../src/saas-operational-http-composition.mjs";

function repository() {
  return { async getActiveByPrefix() { return null; } };
}

test("provisioning key carries the dedicated UniJuri access write scope", async () => {
  const key = "provisioning-secret-1234567890-abcdef";
  const authenticator = createGatewayAuthenticator({
    apiKeyRepository: repository(),
    provisioningKey: key,
  });
  const identity = await authenticator.authenticate({ authorization: `Bearer ${key}` });
  assert.equal(identity.role, "service");
  assert.equal(identity.principal.scopes.includes("saas:provision"), true);
  assert.equal(identity.principal.scopes.includes("saas:uni-juri:access:write"), true);
});

test("UniJuri access route remains fail-closed when runtime write flag is disabled", async () => {
  const authenticator = {
    async authenticate() {
      return {
        role: "service",
        principal: {
          id: "backend-provisioner",
          status: "active",
          scopes: ["saas:provision", "saas:uni-juri:access:write"],
        },
      };
    },
  };
  const store = {
    async read() { return {}; },
    async transaction(work) { return work({}); },
  };
  const fallback = { async handleRequest() { return null; } };
  const composition = createSaasOperationalHttpComposition({
    app: fallback,
    authenticator,
    audit: async () => {},
    store,
    unijuriAccessWriteEnabled: false,
  });
  const response = await composition.app.handleRequest({
    method: "POST",
    url: "/v1/saas/uni-juri/access/provision",
    headers: {},
    body: {
      approval: "IGOR_APROVA_UNIJURI_ACCESS_PROVISIONING_V1",
      binding: {
        tenantId: "tenant_uni",
        workspaceId: "workspace_uni_juri",
        subscriptionId: "subscription_uni_juri",
        entitlementId: "entitlement_uni_juri",
        provisioningJobId: "provisioning_uni_juri",
        accessGrantId: "access_uni_juri_igor",
        principalId: "principal_igor",
        productId: "uni-juri",
      },
    },
  });
  assert.equal(response.status, 423);
  assert.equal(JSON.parse(response.body).reason, "write_disabled");
});
