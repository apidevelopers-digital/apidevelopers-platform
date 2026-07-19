import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const namespaceRoot = path.join(repositoryRoot, "node_modules", "@apidevelopers");
mkdirSync(namespaceRoot, { recursive: true });

for (const packageName of ["contracts", "auth", "tenancy"]) {
  const linkPath = path.join(namespaceRoot, packageName);
  if (!existsSync(linkPath)) {
    symlinkSync(path.join(repositoryRoot, "packages", packageName), linkPath, "dir");
  }
}

const { assertAuthContextContract, assertTenantContextContract } = await import("@apidevelopers/contracts");
const { createAuthEngine } = await import("@apidevelopers/auth");
const { createTenancyEngine } = await import("@apidevelopers/tenancy");

test("authenticates without tenant authority and authorizes only an explicit same-tenant membership", async () => {
  const auth = createAuthEngine({
    clock: () => "2026-07-19T11:00:00.000Z",
    verifyCredential: ({ proof }) => proof === "valid-test-proof",
  });

  const authContext = await auth.authenticate({
    authenticationId: "authn.integration.0001",
    principal: { principalId: "principal.integration.0001", type: "service_account", status: "active" },
    credential: {
      credentialId: "credential.integration.0001",
      type: "service_credential",
      status: "active",
      issuedAt: "2026-07-19T10:00:00.000Z",
      expiresAt: "2026-07-19T12:00:00.000Z",
      revokedAt: null,
    },
    proof: "valid-test-proof",
    scopes: ["tenant:access"],
    requestId: "request.auth.integration.0001",
    correlationId: "correlation.auth.integration.0001",
  });

  assert.equal(assertAuthContextContract(authContext), authContext);
  assert.equal(authContext.authorized, false);
  assert.equal(authContext.tenantId, null);
  assert.equal(JSON.stringify(authContext).includes("valid-test-proof"), false);

  const tenancy = createTenancyEngine();
  const membership = {
    membershipId: "membership.integration.0001",
    principalId: authContext.principal.principalId,
    tenantId: "tenant_demo_0001",
    status: "active",
    roles: ["operator"],
    permissions: ["read:status"],
  };

  const tenantContext = tenancy.authorizeTenantAccess({
    authContext,
    tenantId: "tenant_demo_0001",
    membership,
    requiredPermission: "read:status",
    requestId: "request.tenant.integration.0001",
  });

  assert.equal(assertTenantContextContract(tenantContext), tenantContext);
  assert.equal(tenantContext.crossTenantAccessAllowed, false);
  assert.equal(tenancy.assertOwnedResource(tenantContext, { tenantId: "tenant_demo_0001" }), true);

  assert.throws(() => tenancy.authorizeTenantAccess({
    authContext,
    tenantId: "tenant_other_0001",
    membership,
    requiredPermission: "read:status",
    requestId: "request.tenant.integration.0002",
  }), /cross-tenant operation blocked/);

  assert.throws(() => tenancy.assertOwnedResource(tenantContext, { tenantId: "tenant_other_0001" }), /cross-tenant operation blocked/);
});
