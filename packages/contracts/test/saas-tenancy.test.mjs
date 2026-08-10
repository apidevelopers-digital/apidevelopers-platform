import test from "node:test";
import assert from "node:assert/strict";
import {
  assertTenantWorkspaceBinding,
  createTenant,
  createTenantId,
  createWorkspace,
  createWorkspaceId,
  saasTenancyContractVersion,
} from "../src/saas-tenancy.mjs";

test("creates a tenant and workspace with explicit tenant boundary", () => {
  const tenantId = createTenantId("acme");
  const tenant = createTenant({
    tenantId,
    organizationId: "component.organization.acme",
    slug: "Acme",
    displayName: "Acme",
    createdAt: "2026-08-10T00:00:00.000Z",
  });

  const workspace = createWorkspace({
    workspaceId: createWorkspaceId("acme", "zuni-main"),
    tenantId,
    productId: "zuni",
    slug: "Zuni-Main",
    displayName: "Zuni Principal",
    createdAt: "2026-08-10T00:00:00.000Z",
  });

  assert.equal(tenant.schemaVersion, saasTenancyContractVersion);
  assert.equal(tenant.slug, "acme");
  assert.equal(workspace.productId, "zuni");
  assert.equal(workspace.slug, "zuni-main");
  assert.equal(assertTenantWorkspaceBinding(tenant, workspace), true);
});

test("blocks a workspace from crossing tenant boundaries", () => {
  const tenant = createTenant({
    tenantId: createTenantId("acme"),
    organizationId: "component.organization.acme",
    slug: "acme",
    displayName: "Acme",
    createdAt: "2026-08-10T00:00:00.000Z",
  });

  const workspace = createWorkspace({
    workspaceId: createWorkspaceId("other", "zuni-main"),
    tenantId: createTenantId("other"),
    productId: "zuni",
    slug: "zuni-main",
    displayName: "Outro",
    createdAt: "2026-08-10T00:00:00.000Z",
  });

  assert.throws(
    () => assertTenantWorkspaceBinding(tenant, workspace),
    /tenant boundary mismatch/,
  );
});
