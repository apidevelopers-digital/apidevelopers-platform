import assert from "node:assert/strict";
import test from "node:test";
import { createGatewayAuthenticator } from "../src/auth-composition.mjs";

function repo() {
  return { async getActiveByPrefix() { return null; } };
}

test("dedicated provisioning key has only saas:provision scope", async () => {
  const key = "provisioning-secret-1234567890abcdef";
  const authenticator = createGatewayAuthenticator({
    apiKeyRepository: repo(),
    provisioningKey: key,
  });
  const identity = await authenticator.authenticate({ authorization: `Bearer ${key}` });
  assert.equal(identity.role, "service");
  assert.equal(identity.principal.id, "backend-provisioner");
  assert.deepEqual(identity.principal.scopes, ["saas:provision"]);
  assert.equal(identity.principal.scopes.includes("admin:*"), false);
  assert.equal(identity.principal.scopes.includes("saas:access:delegate"), false);
});

test("provisioning key requires high entropy and cannot equal delegated key", () => {
  assert.throws(
    () => createGatewayAuthenticator({ apiKeyRepository: repo(), provisioningKey: "too-short" }),
    /at least 32 characters/,
  );
  const shared = "shared-secret-1234567890abcdefghi";
  assert.throws(
    () => createGatewayAuthenticator({
      apiKeyRepository: repo(),
      provisioningKey: shared,
      delegatedKey: shared,
      delegatedTenantId: "component.tenant.preview",
    }),
    /must be distinct/,
  );
});
