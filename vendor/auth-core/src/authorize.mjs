export function authorize(identity, {
  roles = [],
  scopes = [],
  requireAllScopes = true,
} = {}) {
  if (!identity) {
    return Object.freeze({
      allowed: false,
      reason: "unauthenticated",
      missingScopes: [...scopes],
    });
  }

  if (roles.length > 0 && !roles.includes(identity.role)) {
    return Object.freeze({
      allowed: false,
      reason: "role_forbidden",
      missingScopes: [],
    });
  }

  const granted = new Set(identity.principal?.scopes ?? []);
  const hasWildcard = granted.has("admin:*");
  const missingScopes = scopes.filter((scope) => !hasWildcard && !granted.has(scope));
  const scopesAllowed = requireAllScopes
    ? missingScopes.length === 0
    : scopes.length === 0 || missingScopes.length < scopes.length;

  return Object.freeze({
    allowed: scopesAllowed,
    reason: scopesAllowed ? null : "scope_forbidden",
    missingScopes,
  });
}
