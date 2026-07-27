import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/server.mjs";

test("returns tenant context for authenticated tenant identity", async () => {
  const app = createApp({
    authenticator: {
      async authenticate() {
        return {
          role: "tenant",
          principal: {
            id: "user_123",
            tenantId: "tenant_acme",
            scopes: ["gateway:write", "gateway:read", "gateway:read"],
          },
        };
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/whoami",
    headers: {
      "x-region": "br-south",
    },
  });

  assert.equal(response.status, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.tenantContext.contractType, "TenantContext");
  assert.equal(payload.tenantContext.tenantId, "tenant_acme");
  assert.equal(payload.tenantContext.region, "br-south");
  assert.equal(payload.tenantContext.isolationMode, "strict");
  assert.equal(payload.tenantContext.crossTenantAccessAllowed, false);
  assert.deepEqual(payload.tenantContext.scopes, ["gateway:read", "gateway:write"]);
});

test("rejects authenticated identity without tenant context", async () => {
  const app = createApp({
    authenticator: {
      async authenticate() {
        return {
          role: "operator",
          principal: {
            id: "operator_123",
            scopes: ["gateway:read"],
          },
        };
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/whoami",
  });

  assert.equal(response.status, 403);
  assert.deepEqual(JSON.parse(response.body), {
    error: "tenant_context_unavailable",
  });
});
