import test from "node:test";
import assert from "node:assert/strict";
import { createDelegatedSaasAccessApp } from "../src/saas-delegated-access-v2.mjs";

const SUBJECT_REF = "a".repeat(64);

test("delegated SaaS access awaits async binding signer results", async () => {
  const app = createDelegatedSaasAccessApp({
    authenticator: {
      async authenticate() {
        return {
          role: "service",
          principal: {
            id: "component.principal.backend-unijuri",
            tenantId: "component.tenant.acme",
            scopes: ["saas:access:delegate"],
          },
        };
      },
    },
    federatedPrincipal: {
      async resolveFederatedPrincipal({ tenantId }) {
        return {
          principalId: "component.principal.user",
          tenantId,
          status: "active",
        };
      },
    },
    saasAccess: {
      async resolveActiveGrant({ tenantId, principalId, productId }) {
        return {
          resolved: true,
          grant: {
            accessGrantId: "component.access.acme.main.juri.user",
            principalId,
            tenantId,
            workspaceId: "component.workspace.acme.juri-main",
            productId,
            grantedScopes: ["juri:read"],
            status: "active",
          },
        };
      },
      async evaluateAccess() {
        return { allowed: true, reason: null, missingScopes: [] };
      },
    },
    bindingSigner: {
      async signBinding() {
        await Promise.resolve();
        return {
          version: "uni-juri-delegated-binding/v1",
          algorithm: "RSA-PSS-SHA256",
          keyId: "unijuri-binding-test",
          proof: "payload.signature",
          expiresAt: "2026-08-26T20:00:00.000Z",
        };
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/saas/access/delegated?productId=uni-juri",
    headers: { "x-delegated-subject-ref": SUBJECT_REF },
  });

  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.bindingProof.keyId, "unijuri-binding-test");
  assert.equal(body.bindingProof.proof, "payload.signature");
  assert.equal(typeof body.bindingProof?.then, "undefined");
});
