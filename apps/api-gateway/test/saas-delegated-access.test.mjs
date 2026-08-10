import test from "node:test";
import assert from "node:assert/strict";

import { createDelegatedSaasAccessApp } from "../src/saas-delegated-access.mjs";

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

test("delegated SaaS access requires explicit service delegation scope", async () => {
  const app = createDelegatedSaasAccessApp({
    authenticator: {
      authenticate: async () => actor(["saas:access:read"]),
    },
    federatedPrincipal: {
      resolveFederatedPrincipal: async () => {
        throw new Error("must not resolve subject without delegation scope");
      },
    },
    saasAccess: {
      evaluateAccess: async () => {
        throw new Error("must not evaluate without delegation scope");
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/saas/access/delegated?accessGrantId=grant&workspaceId=workspace&productId=zuni",
    headers: {
      "x-delegated-subject-ref": SUBJECT_REF,
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(JSON.parse(response.body), {
    allowed: false,
    reason: "delegation_scope_forbidden",
    missingScopes: ["saas:access:delegate"],
  });
});

test("delegated SaaS access derives tenant from actor and evaluates opaque subject identity", async () => {
  const observed = {};
  const app = createDelegatedSaasAccessApp({
    authenticator: {
      authenticate: async () => actor(["saas:access:delegate"]),
    },
    federatedPrincipal: {
      resolveFederatedPrincipal: async (input) => {
        observed.federatedInput = input;
        return Object.freeze({
          principalId: "component.principal.0123456789abcdef0123456789abcdef",
          tenantId: input.tenantId,
          status: "active",
        });
      },
    },
    saasAccess: {
      evaluateAccess: async (input) => {
        observed.accessInput = input;
        return Object.freeze({
          allowed: true,
          reason: null,
          missingScopes: [],
        });
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/saas/access/delegated?tenantId=component.tenant.evil&accessGrantId=grant-1&workspaceId=workspace-1&productId=zuni",
    headers: {
      "x-delegated-subject-ref": SUBJECT_REF,
      "x-delegated-scopes": "zuni:read,zuni:reply,zuni:read",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(observed.federatedInput.tenantId, "component.tenant.acme");
  assert.equal(observed.federatedInput.provider, "unico-operator-session");
  assert.equal(observed.federatedInput.externalSubject, SUBJECT_REF);
  assert.equal(observed.federatedInput.subjectType, "delegated_subject_ref");

  assert.equal(observed.accessInput.tenantId, "component.tenant.acme");
  assert.equal(observed.accessInput.accessGrantId, "grant-1");
  assert.equal(observed.accessInput.workspaceId, "workspace-1");
  assert.equal(observed.accessInput.productId, "zuni");
  assert.equal(
    observed.accessInput.identity.principal.id,
    "component.principal.0123456789abcdef0123456789abcdef",
  );
  assert.deepEqual(
    observed.accessInput.identity.principal.scopes,
    ["zuni:read", "zuni:reply"],
  );

  assert.deepEqual(JSON.parse(response.body), {
    allowed: true,
    reason: null,
    missingScopes: [],
    principalId: "component.principal.0123456789abcdef0123456789abcdef",
  });
});
