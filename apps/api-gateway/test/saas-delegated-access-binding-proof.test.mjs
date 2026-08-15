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

test("delegated SaaS access attaches signed Zuni binding proof only after access is allowed", async () => {
  const observed = { signed: null };
  const app = createDelegatedSaasAccessApp({
    authenticator: {
      authenticate: async () => actor(["saas:access:delegate"]),
    },
    federatedPrincipal: {
      resolveFederatedPrincipal: async (input) =>
        Object.freeze({
          principalId: "component.principal.user",
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
            grantedScopes: Object.freeze(["zuni:read"]),
            status: "active",
          }),
        }),
      evaluateAccess: async () =>
        Object.freeze({ allowed: true, reason: null, missingScopes: [] }),
    },
    bindingSigner: {
      signBinding(input) {
        observed.signed = input;
        return Object.freeze({
          version: "zuni-delegated-binding/v1",
          algorithm: "RSA-PSS-SHA256",
          keyId: "zuni-binding-test",
          proof: "payload.signature",
          expiresAt: "2026-08-15T07:00:00.000Z",
        });
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/saas/access/delegated?productId=zuni",
    headers: { "x-delegated-subject-ref": SUBJECT_REF },
  });

  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.deepEqual(observed.signed, {
    tenantId: "component.tenant.acme",
    workspaceId: "component.workspace.acme.zuni-main",
    accessGrantId: "component.access.acme.main.zuni.user",
    productId: "zuni",
    principalId: "component.principal.user",
  });
  assert.equal(body.bindingProof.keyId, "zuni-binding-test");
  assert.equal(body.bindingProof.proof, "payload.signature");
});

test("delegated SaaS access does not sign a denied decision", async () => {
  let signCalls = 0;
  const app = createDelegatedSaasAccessApp({
    authenticator: {
      authenticate: async () => actor(["saas:access:delegate"]),
    },
    federatedPrincipal: {
      resolveFederatedPrincipal: async (input) =>
        Object.freeze({
          principalId: "component.principal.user",
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
            grantedScopes: Object.freeze(["zuni:read"]),
            status: "active",
          }),
        }),
      evaluateAccess: async () =>
        Object.freeze({ allowed: false, reason: "scope_forbidden", missingScopes: ["zuni:documents"] }),
    },
    bindingSigner: {
      signBinding() {
        signCalls += 1;
        return {};
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/saas/access/delegated?productId=zuni",
    headers: { "x-delegated-subject-ref": SUBJECT_REF },
  });

  assert.equal(response.status, 403);
  assert.equal(signCalls, 0);
  const body = JSON.parse(response.body);
  assert.equal(Object.hasOwn(body, "bindingProof"), false);
});
