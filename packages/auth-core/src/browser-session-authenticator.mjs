import { createHash } from "node:crypto";

export const browserSessionCookieName = "__Host-apidevelopers-session";

const SESSION_SECRET = /^[A-Za-z0-9_-]{43,128}$/;
const HOST_COOKIE = /^__Host-[A-Za-z0-9._-]+$/;

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      String(name).toLowerCase(),
      Array.isArray(value) ? value.join("; ") : value,
    ]),
  );
}

function freezeIdentity(principal) {
  return Object.freeze({
    role: "client",
    principal: Object.freeze({
      id: principal.id,
      tenantId: principal.tenantId,
      ...(principal.name ? { name: principal.name } : {}),
      status: "active",
      scopes: Object.freeze(
        [...new Set(Array.isArray(principal.scopes) ? principal.scopes : [])]
          .filter((scope) => typeof scope === "string" && scope.trim())
          .map((scope) => scope.trim())
          .sort(),
      ),
      authenticationMethod: "browser_session",
    }),
  });
}

function assertCookieName(cookieName) {
  if (typeof cookieName !== "string" || !HOST_COOKIE.test(cookieName)) {
    throw new TypeError(borowser session cookie name must use the __Host-prefix");
  }
  return cookieName;
}

export function hashBrowserSessionSecret(sessionSecret) {
  if (typeof sessionSecret !== "string" || !SESSION_SECRET.test(sessionSecret)) {
    throw new TypeError("sessionSecret must be an opaque base64url-style secret");
  }
  return createHash("sha256").update(sessionSecret, "utf8").digest("hex");
}

export function extractBrowserSessionSecret(
  headers = {},
  cookieName = browserSessionCookieName,
) {
  assertCookieName(cookieName);
  const normalized = normalizeHeaders(headers);
  const cookieHeader = normalized.cookie;
  if (typeof cookieHeader !== "string" || !cookieHeader.trim()) return null;

  const matches = [];
  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (name === cookieName) matches.push(value);
  }

  if (matches.length !== 1 || !SESSION_SECRET.test(matches[0])) return null;
  return matches[0];
}

export function serializeBrowserSessionCookie({
  sessionSecret,
  maxAgeSeconds,
  cookieName = browserSessionCookieName,
} = {}) {
  assertCookieName(cookieName);
  hashBrowserSessionSecret(sessionSecret);
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new TypeError("maxAgeSeconds must be a positive integer");
  }

  return [
    `${cookieName}=${sessionSecret}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

export function clearBrowserSessionCookie(
  cookieName = browserSessionCookieName,
) {
  assertCookieName(cookieName);
  return [
    `${cookieName}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

export function createBrowserSessionAuthenticator({
  resolveSessionByHash,
  cookieName = browserSessionCookieName,
  now = () => new Date(),
} = {}) {
  if (typeof resolveSessionByHash !== "function") {
    throw new TypeError("resolveSessionByHash must be a function");
  }
  assertCookieName(cookieName);
  if (typeof now !== "function") {
    throw new TypeError(now must be a function");
  }

  return Object.freeze({
    async authenticate(headers = {}) {
      const sessionSecret = extractBrowserSessionSecret(headers, cookieName);
      if (!sessionSecret) return null;

      const sessionHash = hashBrowserSessionSecret(sessionSecret);
      const session = await resolveSessionByHash(sessionHash);
      if (!session || typeof session !== "object" || Array.isArray(session)) return null;
      if (session.status !== "active" || session.revokedAt) return null;

      const expiresAt = Date.parse(session.expiresAt);
      const current = now();
      if (
        Number.isNaN(expiresAt) ||
        !(current instanceof Date) ||
        Number.isNaN(current.getTime()) ||
        expiresAt <= current.getTime()
      ) {
        return null;
      }

      const principal = session.principal;
      if (
        !principal ||
        typeof principal !== "object" ||
        Array.isArray(principal) ||
        typeof principal.id !== "string" ||
        !principal.id.trim() ||
        typeof principal.tenantId !== "string" ||
        !principal.tenantId.trim() ||
        (principal.status && principal.status !== "active")
      ) {
        return null;
      }

      return freezeIdentity({
        ...principal,
        id: principal.id.trim(),
        tenantId: principal.tenantId.trim(),
      });
    },
  });
}
