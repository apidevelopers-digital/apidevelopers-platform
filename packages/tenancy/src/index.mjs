import {
  assertAuthContextContract,
  assertSameTenant,
  assertTenantContextContract,
  createTenantContext,
} from "@apidevelopers/contracts";

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function string(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function normalize(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return [...new Set(value.map((item, index) => {
    string(item, `${name}[${index}]`);
    return item.trim();
  }))].sort();
}

export function createTenancyEngine() {
  return Object.freeze({
    authorizeTenantAccess({
      authContext,
      tenantId,
      membership,
      requiredPermission,
      requestId,
    } = {}) {
      assertAuthContextContract(authContext);
      string(tenantId, "tenantId");
      string(requiredPermission, "requiredPermission");
      string(requestId, "requestId");
      object(membership, "membership");

      if (membership.status !== "active") throw new Error("membership is not active");
      if (membership.principalId !== authContext.principal.principalId) {
        throw new Error("membership principal mismatch");
      }
      if (membership.tenantId !== tenantId) {
        throw new Error("cross-tenant operation blocked");
      }

      const roles = normalize(membership.roles ?? [], "membership.roles");
      const permissions = normalize(membership.permissions ?? [], "membership.permissions");
      if (!permissions.includes(requiredPermission)) {
        throw new Error("tenant permission denied");
      }

      return createTenantContext({
        tenantId,
        principalId: authContext.principal.principalId,
        requestId,
        roles,
        permissions,
      });
    },

    assertOwnedResource(tenantContext, resource) {
      assertTenantContextContract(tenantContext);
      object(resource, "resource");
      string(resource.tenantId, "resource.tenantId");

      const resourceContext = createTenantContext({
        tenantId: resource.tenantId,
        principalId: tenantContext.principalId,
        requestId: tenantContext.requestId,
        roles: tenantContext.roles,
        permissions: tenantContext.permissions,
      });
      assertSameTenant(tenantContext, resourceContext);
      return true;
    },
  });
}
