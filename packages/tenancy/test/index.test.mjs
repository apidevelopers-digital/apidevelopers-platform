import test from "node:test";
import assert from "node:assert/strict";

import { createAuthContext } from "@apidevelopers/contracts";
import { createTenancyEngine } from "../src/index.mjs";

function authContext() {
  return createAuthContext({
    authenticationId: "authn.0001",
    principal: { principalId: "principal.0001", type: "user", status: "active" },
    credential: {
      credentialId: "credential.0001",
      type: "session",
      status: "active",
      issuedAt: "2026-07-19T10:00:00.000Z",
      expiresAt: "2026-07-19T12:00:00.000Z",
    },
    scopes: ["tenant:access"],
    requestId: "request.auth.0001",
    correlationId: "correlation.auth.0001",
    authenticatedAt: "2026-07-19T11:00:00.000Z",
  });
}

const membership = {
  membershipId: "membership.0001",
  principalId: "principal.0001",
  tenantId: "tenant_demo_0001",
  status: "active",
  roles: ["operator"],
  permissions: ["read:status"],
};

test("creates a strict tenant context after membership and permission checks", () => {
  const engine = createTenancyEngine();
  const context = engine.authorizeTenantAccess({
    authContext: authContext(),
    tenantId: "tenant_demo_0001",
    membership,
    requiredPermission: "read:status",
    requestId: "request.tenant.0001",
  });

  assert.equal(context.tenantId, "tenant_demo_0001");
  assert.equal(context.principalId, "principal.0001");
  assert.equal(context.isolationMode, "strict");
  assert.equal(context.crossTenantAccessAllowed, false);
  assert.ok(Object.isFrozen(context));
});

test("blocks cross-tenant memberships and resources", () => {
  const engine = createTenancyEngine();
  assert.throws(() => engine.authorizeTenantAccess({
    authContext: authContext(),
    tenantId: "tenant_other_0001",
    membership,
    requiredPermission: "read:status",
    requestId: "request.tenant.0002",
  }), /cross-tenant operation blocked/);

  const context = engine.authorizeTenantAccess({
    authContext: authContext(),
    tenantId: "tenant_demo_0001",
    membership,
    requiredPermission: "read:status",
    requestId: "request.tenant.0003",
  });
  assert.throws(() => engine.assertOwnedResource(context, { tenantId: "tenant_other_0001" }), /cross-tenant operation blocked/);
});

test("denies inactive membership or missing permission", () => {
  const engine = createTenancyEngine();
  assert.throws(() => engine.authorizeTenantAccess({
    authContext: authContext(),
    tenantId: "tenant_demo_0001",
    membership: { ...membership, status: "revoked" },
    requiredPermission: "read:status",
    requestId: "request.tenant.0004",
  }), /membership is not active/);

  assert.throws(() => engine.authorizeTenantAccess({
    authContext: authContext(),
    tenantId: "tenant_demo_0001",
    membership,
    requiredPermission: "write:status",
    requestId: "request.tenant.0005",
  }), /tenant permission denied/);
});
