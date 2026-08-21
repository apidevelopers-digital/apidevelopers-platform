import test from "node:test";
import assert from "node:assert/strict";

import { createGatewayAuthenticator } from "../src/auth-composition.mjs";

const repository = Object.freeze({
  async getActiveByPrefix() {
    return null;
  },
});

test("delegated backend key gains preview-only provisioning scope, never generic provisioning", async () => {
  const authenticator = createGatewayAuthenticator({
    apiKeyRepository: repository,
    delegatedKey: "delegated-secret-1234567890",
    delegatedTenantId: "component.tenant.institution",
  });

  const identity = await authenticator.authenticate({
    authorization: "Bearer delegated-secret-1234567890",
  });

  assert.equal(identity.role, "service");
  assert.deepEqual(
    [...identity.principal.scopes].sort(),
    ["saas:access:delegate", "saas:provision:zuni-preview"].sort(),
  );
  assert.equal(identity.principal.scopes.includes("saas:provision"), false);
});
