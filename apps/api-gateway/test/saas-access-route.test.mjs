import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/server.mjs";

const TENANT = "component.tenant.acme";
const WORKSPACE = "component.workspace.acme.zuni-main";
const GRANT = "component.access.acme.zuni-main.zuni.user-1";

function identity() {
  return {
    role: "client",
    principal: {
      id: "user-1",
      tenantId: TENANT,
      scopes: ["zuni:use"],
    },
  };
}

test("GET /v1/saas/access derives tenant from authenticated identity", async () => {
  const calls = [];
  const app = createApp({
    authenticator: {
      async authenticate() {
        return identity();
      },
    },
    saasAccess: {
      async evaluateAccess(input) {
        calls.push(input);
        return { allowed: true, reason: null, missingScopes: [] };
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: `/v1/saas/access?accessGrantId=${encodeURIComponent(GRANT)}&workspaceId=${encodeURIComponent(WORKSPACE)}&productId=zuni&tenantId=component.tenant.evil`,
    headers: { authorization: "Bearer test" },
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tenantId, TENANT);
  assert.equal(calls[0].identity.principal.id, "user-1");
  assert.deepEqual(JSON.parse(response.body), {
    allowed: true,
    reason: null,
    missingScopes: [],
  });
});

test("GET /v1/saas/access returns 403 for a denied decision", async () => {
  const app = createApp({
    authenticator: {
      async authenticate() {
        return identity();
      },
    },
    saasAccess: {
      async evaluateAccess() {
        return {
          allowed: false,
          reason: "access_principal_mismatch",
        };
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: `/v1/saas/access?accessGrantId=${encodeURIComponent(GRANT)}&workspaceId=${encodeURIComponent(WORKSPACE)}&productId=zuni`,
  });

  assert.equal(response.status, 403);
  assert.deepEqual(JSON.parse(response.body), {
    allowed: false,
    reason: "access_principal_mismatch",
  });
});

test("GET /v1/saas/access fails closed when SaaS access service is unavailable", async () => {
  const app = createApp({
    authenticator: {
      async authenticate() {
        return identity();
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: `/v1/saas/access?accessGrantId=${encodeURIComponent(GRANT)}&workspaceId=${encodeURIComponent(WORKSPACE)}&productId=zuni`,
  });

  assert.equal(response.status, 503);
  assert.deepEqual(JSON.parse(response.body), {
    allowed: false,
    reason: "saas_access_unavailable",
  });
});

test("GET /v1/saas/access requires explicit grant workspace and product", async () => {
  const app = createApp({
    authenticator: {
      async authenticate() {
        return identity();
      },
    },
    saasAccess: {
      async evaluateAccess() {
        throw new Error("must not be called");
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/saas/access?productId=zuni",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(response.body), {
    allowed: false,
    reason: "access_context_required",
  });
});
