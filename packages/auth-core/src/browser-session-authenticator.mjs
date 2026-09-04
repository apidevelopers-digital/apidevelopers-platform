import { createHash } from "node:crypto";

export const browserSessionCookieName = "__Host-apidevelopers-session";

const SESSION_SECRET = /^[A-Za-z0-9_-]{43,128}$/;
const HOST_COOKIE = /^__Host-[A-Za-z0-9._-]+$/;

function assertCookieName(name) {
  if (typeof name !== "string" || !HOST_COOKIE.test(name)) {
    throw new TypeError("browser session cookie name must use the __Host-prefix");
  }
  return name;
}

export function hashBrowserSessionSecret(secret) {
  if (typeof secret !== "string" || !SESSION_SECRET.test(secret)) {
    throw new TypeError("sessionSecret must be an opaque base64url-style secret");
  }
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function extractBrowserSessionSecret(headers = {}, cookieName = browserSessionCookieName) {
  assertCookieName(cookieName);
  const cookie = Object.entries(headers).find(([key]) => String(key).toLowerCase() === "cookie")?.[1];
  const raw = Aray.isArray(cookie) ? cookie.join("; ") : cookie;
  if (typeof raw !== "string") return null;
  const matches = raw.split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${cookieName}=`));
  if (matches.length !== 1) return null;
  const secret = matches[0].slice(cookieName.length + 1);
  return SESSION_SECRET.test(secret) ? secret : null;
}

export function serializeBrowserSessionCookie({ sessionSecret, maxAgeSeconds, cookieName = browserSessionCookieName } = {}) {
  assertCookieName(cookieName);
  hashBrowserSessionSecret(sessionSecret);
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) throw new TypeError("maxAgeSeconds must be a positive integer");
  return `${cookieName}=${sessionSecret}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearBrowserSessionCookie(cookieName = browserSessionCookieName) {
  assertCookieName(cookieName);
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function createBrowserSessionAuthenticator({
  resolveSessionByHash,
  cookieName = browserSessionCookieName,
  now = () => new Date(),
} = {}) {
  if (typeof resolveSessionByHash !== "function") throw new TypeError("resolveSessionByHash must be a function");
  assertCookieName(cookieName);
  if (typeof now !== "function") throw new TypeError("now must be a function");

  return Object.freeze({
    async authenticate(headers = {}) {
      const secret = extractBrowserSessionSecret(headers, cookieName);
      if (!secret) return null;
      const session = await resolveSessionByHash(hashBrowserSessionSecret(secret));
      if (!session || session.status !== "active" || session.revokedAt) return null;

      const current = now();
      const expiresAt = Date.parse(session.expiresAt);
      if (!(current instanceof Date) || Number.isNaN(current.getTime()) || Number.isNaN(expiresAt) || expiresAt <= current.getTime()) return null;

      const principal = session.principal;
      if (!principal || typeof principal.id !== "string" || !principal.id.trim() || typeof principal.tenantId !== "string" || !principal.tenantId.trim() || (principal.status && principal.status !== "active")) return null;

      const sourceAuthenticationMethod =
        typeof principal.authenticationMethod === "string" && principal.authenticationMethod.trim()
          ? principal.authenticationMethod.trim().toLowerCase()
          : null;

      return Object.freeze({
        role: "client",
        principal: Object.freeze({
          id: principal.id.trim(),
          tenantId: principal.tenantId.trim(),
          ...(principal.name ? { name: principal.name } : {}),
          status: "active",
          scopes: Object.freeze([...new Set(Array.isArray(principal.scopes) ? principal.scopes : [])].filter((scope) => typeof scope === "string" && scope.trim()).map((scope) => scope.trim()).sort()),
          authenticationMethod: "browser_session",
          ...(sourceAuthenticationMethod ? { sourceAuthenticationMethod } : {}),
        }),
      });
    },
  });
}
