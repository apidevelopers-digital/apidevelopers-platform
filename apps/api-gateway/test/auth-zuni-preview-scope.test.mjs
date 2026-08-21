import test from "node:test";
import assert from "node:assert/strict";

import { createGatewayAuthenticator } from "../src/auth-composition.mjs";

const repository = Object.freeze({
  async getActiveByPrefix() {
    return null;
  },
});

test("delegated backend key stays limited to delegated access and never gains generic provisioning", async () => {
  const authenticator = createGatewayAuthenticator({
    apiKeyRepository: repository,
    delegatedKey: "delegated-secret-1234567890",
    delegatedTenantId: "component.tenant.institution",
  });

  const identity = await authenticator.authenticate({
    authorization: "Bearer delegated-secret-1234567890",
  });

  assert.equal(identity.role, "service");
  assert.equal(identity.principal.id, "backend-delegated");
  assert.deepEqual(identity.principal.scopes, ["saas:access:delegate"]);
  assert.equal(identity.principal.scopes.includes("saas:provision"), false);
  assert.equal(identity.principal.scopes.includes("saas:provision:zuni-preview"), false);
});
