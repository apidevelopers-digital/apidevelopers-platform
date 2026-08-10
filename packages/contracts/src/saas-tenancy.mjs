import { assertCanonicalId, createCanonicalId } from "./canonical-ids.mjs";

export const saasTenancyContractVersion = 1;

const TENANT_STATUSES = new Set(["active", "suspended", "archived"]);
const WORKSPACE_STATUSES = new Set(["active", "suspended", "archived"]);

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertIsoDate(value, name) {
  assertNonEmptyString(value, name);
  if (Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} must be an ISO-8601 date`);
  }
}

function assertStatus(value, allowed, name) {
  if (!allowed.has(value)) {
    throw new TypeError(`${name} is invalid`);
  }
}

export function createTenant({
  tenantId,
  organizationId,
  slug,
  displayName,
  status = "active",
  createdAt = new Date().toISOString(),
} = {}) {
  assertCanonicalId(tenantId, { expectedFamily: "component" });
  assertCanonicalId(organizationId, { expectedFamily: "component" });
  assertNonEmptyString(slug, "slug");
  assertNonEmptyString(displayName, "displayName");
  assertStatus(status, TENANT_STATUSES, "status");
  assertIsoDate(createdAt, "createdAt");

  return Object.freeze({
    schemaVersion: saasTenancyContractVersion,
    tenantId,
    organizationId,
    slug: slug.trim().toLowerCase(),
    displayName: displayName.trim(),
    status,
    createdAt,
  });
}

export function createWorkspace({
  workspaceId,
  tenantId,
  productId,
  slug,
  displayName,
  status = "active",
  createdAt = new Date().toISOString(),
} = {}) {
  assertCanonicalId(workspaceId, { expectedFamily: "component" });
  assertCanonicalId(tenantId, { expectedFamily: "component" });
  assertNonEmptyString(productId, "productId");
  assertNonEmptyString(slug, "slug");
  assertNonEmptyString(displayName, "displayName");
  assertStatus(status, WORKSPACE_STATUSES, "status");
  assertIsoDate(createdAt, "createdAt");

  return Object.freeze({
    schemaVersion: saasTenancyContractVersion,
    workspaceId,
    tenantId,
    productId: productId.trim().toLowerCase(),
    slug: slug.trim().toLowerCase(),
    displayName: displayName.trim(),
    status,
    createdAt,
  });
}

export function assertTenantWorkspaceBinding(tenant, workspace) {
  assertObject(tenant, "tenant");
  assertObject(workspace, "workspace");
  if (tenant.schemaVersion !== saasTenancyContractVersion) {
    throw new TypeError("tenant.schemaVersion is unsupported");
  }
  if (workspace.schemaVersion !== saasTenancyContractVersion) {
    throw new TypeError("workspace.schemaVersion is unsupported");
  }
  if (tenant.tenantId !== workspace.tenantId) {
    throw new Error("workspace tenant boundary mismatch");
  }
  return true;
}

export function createTenantId(slug) {
  assertNonEmptyString(slug, "slug");
  return createCanonicalId({
    family: "component",
    segments: ["tenant", slug.trim().toLowerCase()],
  });
}

export function createWorkspaceId(tenantSlug, workspaceSlug) {
  assertNonEmptyString(tenantSlug, "tenantSlug");
  assertNonEmptyString(workspaceSlug, "workspaceSlug");
  return createCanonicalId({
    family: "component",
    segments: ["workspace", tenantSlug.trim().toLowerCase(), workspaceSlug.trim().toLowerCase()],
  });
}
