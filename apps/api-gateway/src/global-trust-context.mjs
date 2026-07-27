import {
  assertTenantContextContract,
  createGlobalTrustTenantContext,
} from "@apidevelopers/contracts";

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) {
    throw new TypeError("scopes must be an array");
  }

  return [...new Set(scopes.map((scope) => {
    if (typeof scope !== "string" || scope.trim().length === 0) {
      throw new TypeError("each scope must be a non-empty string");
    }
    return scope.trim();
  }))].sort();
}

export function createGatewayGlobalTrustTenantContext({
  tenantId,
  region = "global",
  scopes = [],
} = {}) {
  const context = createGlobalTrustTenantContext({
    tenantId,
    region,
    scopes: normalizeScopes(scopes),
  });

  return assertTenantContextContract(context, "gatewayTenantContext");
}
