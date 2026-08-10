import test from "node:test";
import assert from "node:assert/strict";

import { createDelegatedSaasAccessApp } from "../src/saas-delegated-access-v2.mjs";

const SUBJECT_REF = "a".repeat(64);

function actor(scopes = []) {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "component.principal.backend-zuni",
      tenantId: "component.tenant.acme",
      scopes: Object.freeze([...scopes]),
    }),
  });
}

test("delegated SaaS v2 derives subject scopes from AccessGrant", async () => {
  const observed = {};
  const app = createDelegatedSaasAccessApp({
    authenticator: {
      authenticate: async () => actor(["saas:access:delegate"]),
    },
    federatedPrincipal: {
      resolveFederatedPrincipal: async (input) =>
        Object.freeze({
          principalId: "component.principal.0123456789abcdef0123456789abcdef",
          tenantId: input.tenantId,
          status: "active",
        }),
    },
    saasAccess: {
      resolveActiveGrant: async (input) =>
        Object.freeze({
          resolved: true,
          reason: null,
          grant: Object.freeze({
            accessGrantId: "component.access.acme.main.zuni.user",
            principalId: input.principalId,
            tenantId: input.tenantId,
            workspaceId: "component.workspace.acme.zuni-main",
            productId: input.productId,
            requiredScopes: Object.freeze(["zuni:read"]),
            grantedScopes: Object.freeze(["zuni:read", "zuni:reply"]),
            status: "active",
          }),
        }),
      evaluateAccess: async (input) => {
        observed.identity = input.identity;
        return Object.freeze({ allowed: true, reason: null, missingScopes: [] });
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/saas/access/delegated?productId=zuni",
    headers: {
      "x-delegated-subject-ref": SUBJECT_REF,
      "x-delegated-scopes": "zuni:admin",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(observed.identity.principal.scopes, ["zuni:read", "zuni:reply"]);
  assert.equal(observed.identity.principal.scopes.includes("zuni:admin"), false);
});

test("delegated SaaS v2 remains fail-closed without service delegation scope", async () => {
  const app = createDelegatedSaasAccessApp({
    authenticator: {
      authenticate: async () => actor(["saas:access:read"]),
    },
    federatedPrincipal: {
      resolveFederatedPrincipal: async () => {
        throw new Error("must not resolve subject");
      },
    },
    saasAccess: {
      resolveActiveGrant: async () => {
        throw new Error("must not resolve grant");
      },
      evaluateAccess: async () => {
        throw new Error("must not evaluate");
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/saas/access/delegated?productId=zuni",
    headers: { "x-delegated-subject-ref": SUBJECT_REF },
  });

  assert.equal(response.status, 403);
  assert.equal(JSON.parse(response.body).reason, "delegation_scope_forbidden");
});
