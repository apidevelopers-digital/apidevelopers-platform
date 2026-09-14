export const uniCoPreviewProductId = "product:uni-co";
export const mitraPreviewProductId = "product:mitra";

function normalizeAllowedProductIds(value) {
  const ids = Array.isArray(value) && value.length ? value : [uniCoPreviewProductId];
  return new Set(ids.map((item) => String(item ?? "").trim()).filter(Boolean));
}

export function createUniCoPreviewSaasAccessResolver({
  accessRuntime,
  allowedProductIds,
} = {}) {
  if (!accessRuntime || typeof accessRuntime.resolveActiveGrant !== "function") {
    throw new TypeError("accessRuntime.resolveActiveGrant is required");
  }

  const allowed = normalizeAllowedProductIds(allowedProductIds);

  return async function resolveAccess({ identity, productId, requiredScopes = [] } = {}) {
    const principalId = String(identity?.principalId ?? identity?.principal?.id ?? "").trim();
    const tenantId = String(identity?.tenantId ?? identity?.principal?.tenantId ?? "").trim();
    const requestedProductId = String(productId ?? "").trim();

    if (!principalId || !tenantId) {
      const error = new Error("preview_identity_binding_required");
      error.status = 403;
      throw error;
    }
    if (!allowed.has(requestedProductId)) {
      const error = new Error("preview_product_not_allowed");
      error.status = 403;
      throw error;
    }

    const resolved = await accessRuntime.resolveActiveGrant({
      tenantId,
      principalId,
      productId: requestedProductId,
    });

    if (!resolved?.resolved || !resolved?.grant) {
      const error = new Error(resolved?.reason ?? "access_grant_not_found");
      error.status = 403;
      throw error;
    }

    const grant = resolved.grant;
    const workspaceId = String(grant.workspaceId ?? "").trim();
    const accessGrantId = String(grant.accessGrantId ?? "").trim();
    if (!workspaceId || !accessGrantId) {
      const error = new Error("active_access_grant_incomplete");
      error.status = 403;
      throw error;
    }

    const grantedScopes = new Set(Array.isArray(grant.requiredScopes) ? grant.requiredScopes : []);
    const missingScopes = requiredScopes.filter((scope) => !grantedScopes.has(scope));
    if (missingScopes.length > 0) {
      const error = new Error("active_access_grant_scope_mismatch");
      error.status = 403;
      error.missingScopes = missingScopes;
      throw error;
    }

    const expected = identity?.expectedBinding;
    if (expected && typeof expected === "object") {
      const expectedWorkspaceId = String(expected.workspaceId ?? "").trim();
      const expectedAccessGrantId = String(expected.accessGrantId ?? "").trim();
      const expectedProductId = String(expected.productId ?? "").trim();
      if (
        expectedWorkspaceId !== workspaceId ||
        expectedAccessGrantId !== accessGrantId ||
        expectedProductId !== requestedProductId
      ) {
        const error = new Error("preview_identity_binding_mismatch");
        error.status = 403;
        throw error;
      }
    }

    return Object.freeze({
      principalId,
      tenantId,
      workspaceId,
      accessGrantId,
    });
  };
}
