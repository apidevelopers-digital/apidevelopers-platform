import { createHash, timingSafeEqual } from "node:crypto";

export function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      Array.isArray(value) ? value.join(", ") : value,
    ]),
  );
}

export function extractApiKey(headers = {}) {
  const normalized = normalizeHeaders(headers);
  const direct = normalized["x-api-key"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const authorization = normalized.authorization;
  if (typeof authorization !== "string") return null;
  const match = authorization.match(/^(?:ApiKey|Bearer)\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function secureCompareSecrets(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function createAuthenticator({
  adminKey,
  resolveClient,
  adminPrincipal = {
    id: "platform-admin",
    name: "Platform Administrator",
    status: "active",
    scopes: ["admin:*"],
  },
  compareSecrets = secureCompareSecrets,
} = {}) {
  if (typeof resolveClient !== "function") {
    throw new TypeError("resolveClient must be a function");
  }

  return Object.freeze({
    authenticate(headers = {}) {
      const apiKey = extractApiKey(headers);
      if (!apiKey) return null;

      if (adminKey && compareSecrets(apiKey, adminKey)) {
        return Object.freeze({
          role: "admin",
          principal: Object.freeze(structuredClone(adminPrincipal)),
        });
      }

      const client = resolveClient(apiKey);
      if (!client) return null;

      return Object.freeze({
        role: "client",
        principal: Object.freeze(structuredClone(client)),
      });
    },
  });
}

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

export { createAsyncAuthenticator } from "./async-authenticator.mjs";
