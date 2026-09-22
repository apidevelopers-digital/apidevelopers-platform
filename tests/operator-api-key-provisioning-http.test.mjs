import test from "node:test";
import assert from "node:assert/strict";

import { createOperatorApiKeyProvisioningHttpApp } from "../apps/api-gateway/src/operator-api-key-provisioning-http.mjs";

function createAuthenticator(identity) {
  return {
    async authenticate() {
      return identity;
    },
  };
}

function createProvisioner() {
  const calls = [];
  return {
    calls,
    planIssue(input) {
      calls.push({ type: "plan", input });
      return {
        service: "gateway-key-provisioner",
        mode: "dry-run",
        tenantId: input.tenantId,
        name: input.name,
        scopes: input.scopes,
        secretReturned: false,
        requiresApproval: true,
      };
    },
    async issue(input) {
      calls.push({ type: "issue", input });
      if (input.confirmation !== "IGOR_APROVA_GATEWAY_KEY_PROVISIONER_REAL") {
        throw new Error("approval_phrase_mismatch");
      }
      return {
        service: "gateway-key-provisioner",
        mode: "real",
        tenantId: input.tenantId,
        name: input.name,
        scopes: input.scopes,
        apiKeyId: "key_001",
        prefix: "apid_testpre",
        status: "active",
        createdAt: "2026-09-21T00:00:00.000Z",
        secret: "apid_test_secret_value",
        secretReturned: true,
        secretHandling: "return-once-to-operator-store-immediately",
      };
    },
  };
}

const operatorIdentity = Object.freeze({
  role: "service",
  principal: Object.freeze({
    id: "institutional-operator",
    tenantId: "tenant_api_developers",
    name: "Institutional Operator",
    scopes: ["operator:resource:read"],
  }),
});

test("returns dry-run plan for an authorized operator", async () => {
  const provisioner = createProvisioner();
  const app = createOperatorApiKeyProvisioningHttpApp({
    authenticator: createAuthenticator(operatorIdentity),
    provisioner,
  });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/operator/api-keys/issue",
    headers: { "x-api-key": "test" },
    body: JSON.stringify({
      tenantId: "tenant_api_developers",
      name: "ada-mitra-bridge-read",
      scopes: ["ada:mitra:read"],
      reason: "ADA Mitra Bridge read-only probe",
    }),
  });

  assert.equal(response.status, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "dry-run");
  assert.equal(payload.secretReturned, false);
  assert.deepEqual(payload.scopes, ["ada:mitra:read"]);
  assert.equal(provisioner.calls[0].type, "plan");
});

test("returns a one-time secret only in real mode with explicit confirmation", async () => {
  const provisioner = createProvisioner();
  const app = createOperatorApiKeyProvisioningHttpApp({
    authenticator: createAuthenticator(operatorIdentity),
    provisioner,
  });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/operator/api-keys/issue",
    headers: { "x-api-key": "test" },
    body: JSON.stringify({
      mode: "real",
      tenantId: "tenant_api_developers",
      name: "ada-mitra-bridge-read",
      scopes: ["ada:mitra:read"],
      reason: "ADA Mitra Bridge read-only probe",
      confirmation: "IGOR_APROVA_GATEWAY_KEY_PROVISIONER_REAL",
    }),
  });

  assert.equal(response.status, 201);
  const payload = JSON.parse(response.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "real");
  assert.equal(payload.secretReturned, true);
  assert.equal(payload.secret, "apid_test_secret_value");
  assert.equal(provisioner.calls[0].type, "issue");
});

test("rejects unauthorized and insufficient-scope callers", async () => {
  const provisioner = createProvisioner();

  const unauthenticated = createOperatorApiKeyProvisioningHttpApp({
    authenticator: createAuthenticator(null),
    provisioner,
  });
  assert.equal((await unauthenticated.handleRequest({
    method: "POST",
    url: "/v1/operator/api-keys/issue",
    body: "{}",
  })).status, 401);

  const insufficient = createOperatorApiKeyProvisioningHttpApp({
    authenticator: createAuthenticator({
      role: "service",
      principal: { scopes: ["saas:provision"] },
    }),
    provisioner,
  });
  assert.equal((await insufficient.handleRequest({
    method: "POST",
    url: "/v1/operator/api-keys/issue",
    body: "{}",
  })).status, 403);
});

test("ignores unrelated routes and rejects invalid method/body", async () => {
  const app = createOperatorApiKeyProvisioningHttpApp({
    authenticator: createAuthenticator(operatorIdentity),
    provisioner: createProvisioner(),
  });

  assert.equal(await app.handleRequest({ method: "GET", url: "/health" }), null);

  const method = await app.handleRequest({ method: "GET", url: "/v1/operator/api-keys/issue" });
  assert.equal(method.status, 405);

  const invalid = await app.handleRequest({
    method: "POST",
    url: "/v1/operator/api-keys/issue",
    body: "not-json",
  });
  assert.equal(invalid.status, 400);
  assert.equal(JSON.parse(invalid.body).error, "invalid_json_body");
});
