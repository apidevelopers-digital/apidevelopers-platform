import test from "node:test";
import assert from "node:assert/strict";

import { createDelegatedSaasAccessApp } from "../src/saas-delegated-access-v2.mjs";

const SUBJECT_REF = "b".repeat(64);

function actor() {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "component.principal.backend-zuni",
      tenantId: "component.tenant.preview-zuni",
      scopes: Object.freeze(["saas:access:delegate"]),
    }),
  });
}

test("delegated SaaS v2 exposes safe commercial plan context after access is allowed", async () => {
  const app = createDelegatedSaasAccessApp({
    authenticator: { authenticate: async () => actor() },
    federatedPrincipal: {
      resolveFederatedPrincipal: async (input) => Object.freeze({
        principalId: "component.principal.0123456789abcdef0123456789abcdef",
        tenantId: input.tenantId,
        status: "active",
      }),
    },
    saasAccess: {
      resolveActiveGrant: async (input) => Object.freeze({
        resolved: true,
        reason: null,
        grant: Object.freeze({
          accessGrantId: "component.access.preview-zuni.principal.zuni.user",
          principalId: input.principalId,
          tenantId: input.tenantId,
          workspaceId: "component.workspace.preview-zuni.principal",
          productId: input.productId,
          requiredScopes: Object.freeze(["zuni:read"]),
          grantedScopes: Object.freeze(["zuni:read"]),
          status: "active",
        }),
      }),
      evaluateAccess: async () => Object.freeze({
        allowed: true,
        reason: null,
        missingScopes: [],
      }),
      resolveCommercialContext: async () => Object.freeze({
        resolved: true,
        reason: null,
        commercial: Object.freeze({
          subscriptionId: "component.subscription.preview-zuni.zuni",
          planId: "pro",
          subscriptionStatus: "active",
          entitlement: Object.freeze({
            entitlementId: "component.entitlement.preview-zuni.principal.inbox",
            capability: "inbox",
            status: "active",
            sourcePlanId: "pro",
          }),
        }),
      }),
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/saas/access/delegated?productId=zuni",
    headers: {
      "x-delegated-subject-ref": SUBJECT_REF,
    },
  });

  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.allowed, true);
  assert.equal(body.binding.tenantId, "component.tenant.preview-zuni");
  assert.equal(body.binding.workspaceId, "component.workspace.preview-zuni.principal");
  assert.deepEqual(body.commercial, {
    subscriptionId: "component.subscription.preview-zuni.zuni",
    planId: "pro",
    subscriptionStatus: "active",
    entitlement: {
      entitlementId: "component.entitlement.preview-zuni.principal.inbox",
      capability: "inbox",
      status: "active",
      sourcePlanId: "pro",
    },
  });
  assert.equal(Object.hasOwn(body.commercial, "monthlyAmount"), false);
  assert.equal(Object.hasOwn(body.commercial, "currency"), false);
});

test("delegated SaaS v2 fails closed when commercial context mismatches", async () => {
  const app = createDelegatedSaasAccessApp({
    authenticator: { authenticate: async () => actor() },
    federatedPrincipal: {
      resolveFederatedPrincipal: async (input) => Object.freeze({
        principalId: "component.principal.0123456789abcdef0123456789abcdef",
        tenantId: input.tenantId,
        status: "active",
      }),
    },
    saasAccess: {
      resolveActiveGrant: async (input) => Object.freeze({
        resolved: true,
        reason: null,
        grant: Object.freeze({
          accessGrantId: "component.access.preview-zuni.principal.zuni.user",
          principalId: input.principalId,
          tenantId: input.tenantId,
          workspaceId: "component.workspace.preview-zuni.principal",
          productId: input.productId,
          requiredScopes: Object.freeze(["zuni:read"]),
          grantedScopes: Object.freeze(["zuni:read"]),
          status: "active",
        }),
      }),
      evaluateAccess: async () => Object.freeze({
        allowed: true,
        reason: null,
        missingScopes: [],
      }),
      resolveCommercialContext: async () => Object.freeze({
        resolved: false,
        reason: "commercial_context_mismatch",
        commercial: null,
      }),
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/saas/access/delegated?productId=zuni",
    headers: { "x-delegated-subject-ref": SUBJECT_REF },
  });

  assert.equal(response.status, 403);
  const body = JSON.parse(response.body);
  assert.equal(body.allowed, false);
  assert.equal(body.reason, "commercial_context_mismatch");
});
