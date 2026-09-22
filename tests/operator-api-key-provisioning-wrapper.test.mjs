import test from "node:test";
import assert from "node:assert/strict";

import { createOperatorApiKeyProvisioningWrapper } from "../apps/api-gateway/src/operator-api-key-provisioning-wrapper.mjs";

test("returns the operator provisioner response when it handles the request", async () => {
  const fallbackCalls = [];
  const wrapper = createOperatorApiKeyProvisioningWrapper({
    operatorApiKeyProvisioningApp: {
      async handleRequest(request) {
        return request.url === "/v1/operator/api-keys/issue"
          ? { status: 200, headers: {}, body: "operator" }
         : null;
      },
    },
    app: {
      async handleRequest(request) {
        fallbackCalls.push(request);
        return { status: 404, headers: {}, body: "fallback" };
      },
    },
  });

  const response = await wrapper.handleRequest({ url: "/v1/operator/api-keys/issue" });

  assert.equal(response.status, 200);
  assert.equal(fallbackCalls.length, 0);
});

test("falls back to the base app when the operator provisioner ignores the request", async () => {
  const fallbackCalls = [];
  const wrapper = createOperatorApiKeyProvisioningWrapper({
    operatorApiKeyProvisioningApp: {
      async handleRequest() {
        return null;
      },
    },
    app: {
      async handleRequest(request) {
        fallbackCalls.push(request);
        return { status: 204, headers: {}, body: "fallback" };
      },
    },
  });

  const request = { url: "/health" };
  const response = await wrapper.handleRequest(request);

  assert.equal(response.status, 204);
  assert.deepEqual(fallbackCalls, [request]);
});

test("requires wrapped apps", () => {
  assert.throws(
    () => createOperatorApiKeyProvisioningWrapper({ operatorApiKeyProvisioningApp: { async handleRequest() {} } }),
    /app\.handleRequest must be a function/
  );
  assert.throws(
    () => createOperatorApiKeyProvisioningWrapper({ app: { async handleRequest() {} } }),
    /operatorApiKeyProvisioningApp\.handleRequest must be a function/
  );
});
