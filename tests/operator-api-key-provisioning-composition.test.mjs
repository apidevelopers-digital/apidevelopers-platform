import test from "node:test";
import assert from "node:assert/strict";

import { createOperatorApiKeyProvisioningRuntimeApp } from "../apps/api-gateway/src/operator-api-key-provisioning-composition.mjs";

const operatorIdentity = Object.freeze({
  role: "service",
  principal: Object.freeze({
    id: "institutional-operator",
    name: "Institutional Operator",
    tenantId: "tenant_api_developers",
    scopes: ["operator:resource:read"],
  }),
});

test("composes the operator HTTP app with the durable API key lifecycle", async () => {
  const lifecycleCalls = [];
  const app = createOperatorApiKeyProvisioningRuntimeApp({
    authenticator: {
      async authenticate() {
        return operatorIdentity;
      },
    },
    apiKeyLifecycle: {
      async issueApiKey(input) {
        lifecycleCalls.push(input);
        return {
          apiKey: {
            id: "key_001",
            prefix: "apid_runtime",
            status: "active",
            createdAt: "2026-09-21T00:00:00.000Z",
          },
          secret: "apid_runtime_secret_value",
          events: [],
        };
      },
    },
  });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/operator/api-keys/issue",
    headers: { "x-api-key": "operator" },
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
  assert.equal(payload.secret, "apid_runtime_secret_value");
  assert.deepEqual(lifecycleCalls, [{
    tenantId: "tenant_api_developers",
    name: "ada-mitra-bridge-read",
    scopes: ["ada:mitra:read"],
  }]);
});

test("requires runtime dependencies before wiring the production route", () => {
  assert.throws(
    () => createOperatorApiKeyProvisioningRuntimeApp({ apiKeyLifecycle: { async issueApiKey() {} } }),
    /authenticator\.authenticate must be a function/,
  );

  assert.throws(
    () => createOperatorApiKeyProvisioningRuntimeApp({ authenticator: { async authenticate() {} } }),
    /apiKeyLifecycle\.issueApiKey must be a function/,
  );
});
