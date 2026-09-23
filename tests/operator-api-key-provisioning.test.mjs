import test from "node:test";
import assert from "node:assert/strict";

import { createGatewayKeyProvisioner } from "../apps/api-gateway/src/operator-api-key-provisioning.mjs";

function createLifecycleStub() {
  const calls = [];
  return {
    calls,
    async issueApiKey(input) {
      calls.push(input);
      return {
        apiKey: {
          id: "key_001",
          prefix: "apid_testpre",
          status: "active",
          createdAt: "2026-09-21T00:00:00.000Z",
        },
        secret: "apid_test_secret_value",
        events: [{ type: "apikey.issued", tenantId: input.tenantId, apiKeyId: "key_001" }],
      };
    },
  };
}

test("plans an approved Mitra read key without returning a secret", () => {
  const lifecycle = createLifecycleStub();
  const provisioner = createGatewayKeyProvisioner({ lifecycleService: lifecycle });

  const plan = provisioner.planIssue({
    tenantId: "tenant_api_developers",
    name: "ada-mitra-bridge-read",
    scopes: ["ada:mitra:read"],
    requestedBy: "Igor",
    reason: "Mitra bridge read-only probe",
  });

  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.secretReturned, false);
  assert.equal(plan.requiresApproval, true);
  assert.deepEqual(plan.scopes, ["ada:mitra:read"]);
  assert.equal(lifecycle.calls.length, 0);
});

test("issues a key only with the explicit approval phrase", async () => {
  const lifecycle = createLifecycleStub();
  const provisioner = createGatewayKeyProvisioner({ lifecycleService: lifecycle });

  const result = await provisioner.issue({
    tenantId: "tenant_api_developers",
    name: "ada-mitra-bridge-read",
    scopes: ["ada:mitra:read"],
    requestedBy: "Igor",
    reason: "Mitra bridge read-only probe",
    confirmation: "IGOR_APROVA_GATEWAY_KEY_PROVISIONER_REAL",
  });

  assert.equal(result.secret, "apid_test_secret_value");
  assert.equal(result.prefix, "apid_testpre");
  assert.equal(result.secretReturned, true);
  assert.deepEqual(lifecycle.calls, [{
    tenantId: "tenant_api_developers",
    name: "ada-mitra-bridge-read",
    scopes: ["ada:mitra:read"],
  }]);
});

test("rejects scopes outside the operator allowlist", () => {
  const lifecycle = createLifecycleStub();
  const provisioner = createGatewayKeyProvisioner({ lifecycleService: lifecycle });

  assert.throws(() => provisioner.planIssue({
    tenantId: "tenant_api_developers",
    name: "unsafe",
    scopes: ["operator:admin"],
  }), /scope_not_allowed:operator:admin/);
});

test("rejects real issue without the exact approval phrase", async () => {
  const lifecycle = createLifecycleStub();
  const provisioner = createGatewayKeyProvisioner({ lifecycleService: lifecycle });

  await assert.rejects(() => provisioner.issue({
    tenantId: "tenant_api_developers",
    name: "ada-mitra-bridge-read",
    scopes: ["ada:mitra:read"],
    confirmation: "wrong",
  }), /approval_phrase_mismatch/);

  assert.equal(lifecycle.calls.length, 0);
});
