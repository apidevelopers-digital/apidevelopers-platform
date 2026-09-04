import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const BROWSER_SESSION_HANDOFF_V1 = "browser-session-handoff/v1";

const HANDOFF_CODE = /^[A-Za-z0-9_-]{43,128}$/;
const HANDOFF_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

export class BrowserSessionHandoffError extends Error {
  constructor(code, { status = 400 } = {}) {
    super(code);
    this.name = "BrowserSessionHandoffError";
    this.code = code;
    this.status = status;
  }
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  return value;
}

function requireStore(store) {
  if (!store || typeof store.putIfAbsent !== "function" || typeof store.take !== "function") {
    throw new TypeError("store must provide putIfAbsent and atomic take");
  }
  return store;
}

function normalizeOrigin(value, name = "targetOrigin") {
  if (typeof value !== "string" || !value.trim()) {
    throw new BrowserSessionHandoffError(`${name}_required`, { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new BrowserSessionHandoffError(`${name}_invalid`, { status: 400 });
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new BrowserSessionHandoffError(`${name}_invalid`, { status: 400 });
  }

  return parsed.origin.toLowerCase();
}

function normalizeAllowedOrigins(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("allowedTargetOrigins must be a non-empty array");
  }

  return Object.freeze(
    [...new Set(values.map((value) => normalizeOrigin(value, "allowedTargetOrigin")))].sort(),
  );
}

function normalizePrincipal(authentication) {
  if (
    !authentication ||
    authentication.role !== "client" ||
    !authentication.principal ||
    typeof authentication.principal !== "object"
  ) {
    throw new BrowserSessionHandoffError("source_session_required", { status: 401 });
  }

  const principal = authentication.principal;
  const id = typeof principal.id === "string" ? principal.id.trim() : "";
  const tenantId = typeof principal.tenantId === "string" ? principal.tenantId.trim() : "";

  if (!id || !tenantId) {
    throw new BrowserSessionHandoffError("source_session_invalid", { status: 401 });
  }

  const scopes = Object.freeze(
    [...new Set(
      (Array.isArray(principal.scopes) ? principal.scopes : [])
        .filter((scope) => typeof scope === "string" && scope.trim())
        .map((scope) => scope.trim()),
    )].sort(),
  );

  const sourceAuthenticationMethod =
    typeof principal.sourceAuthenticationMethod === "string" &&
    principal.sourceAuthenticationMethod.trim()
      ? principal.sourceAuthenticationMethod.trim().toLowerCase()
      : null;

  return Object.freeze({
    id,
    tenantId,
    ...(typeof principal.name === "string" && principal.name.trim()
      ? { name: principal.name.trim() }
      : {}),
    status: "active",
    scopes,
    authenticationMethod:
      typeof principal.authenticationMethod === "string" && principal.authenticationMethod.trim()
        ? principal.authenticationMethod.trim()
        : "browser_session",
    ...(sourceAuthenticationMethod ? { sourceAuthenticationMethod } : {}),
  });
}

function normalizeNow(now) {
  const value = now();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError("now must return a valid Date");
  }
  return value;
}

function normalizeCode(code) {
  if (typeof code !== "string" || !HANDOFF_CODE.test(code)) {
    throw new BrowserSessionHandoffError("handoff_code_invalid", { status: 401 });
  }
  return code;
}

function normalizeCodeChallenge(codeChallenge) {
  if (typeof codeChallenge !== "string" || !HANDOFF_CHALLENGE.test(codeChallenge)) {
    throw new BrowserSessionHandoffError("handoff_code_challenge_invalid", { status: 400 });
  }
  return codeChallenge;
}

function normalizeCodeVerifier(codeVerifier) {
  if (typeof codeVerifier !== "string" || !CODE_VERIFIER.test(codeVerifier)) {
    throw new BrowserSessionHandoffError("handoff_code_verifier_invalid", { status: 401 });
  }
  return codeVerifier;
}

function deriveCodeChallenge(codeVerifier) {
  return createHash("sha256").update(codeVerifier, "utf8").digest("base64url");
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function defaultGenerateCode() {
  return randomBytes(32).toString("base64url");
}

function recordKey(code) {
  const hash = createHash("sha256").update(code, "utf8").digest("hex");
  return `browser-session-handoff:v1:${hash}`;
}

function publicPrincipal(principal) {
  return Object.freeze({
    id: principal.id,
    tenantId: principal.tenantId,
    ...(principal.name ? { name: principal.name } : {}),
    status: "active",
    scopes: Object.freeze([...principal.scopes]),
    authenticationMethod: "browser_session_handoff",
  });
}

export function createBrowserSessionHandoffService({
  sourceAuthenticator,
  store,
  allowedTargetOrigins,
  now = () => new Date(),
  generateCode = defaultGenerateCode,
  ttlSeconds = 90,
} = {}) {
  if (typeof sourceAuthenticator?.authenticate !== "function") {
    throw new TypeError("sourceAuthenticator.authenticate is required");
  }

  requireStore(store);
  requireFunction(now, "now");
  requireFunction(generateCode, "generateCode");

  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 300) {
    throw new TypeError("ttlSeconds must be an integer between 30 and 300");
  }

  const allowedOrigins = normalizeAllowedOrigins(allowedTargetOrigins);

  function requireAllowedTargetOrigin(value) {
    const origin = normalizeOrigin(value);
    if (!allowedOrigins.includes(origin)) {
      throw new BrowserSessionHandoffError("handoff_target_not_allowed", { status: 403 });
    }
    return origin;
  }

  return Object.freeze({
    descriptor: Object.freeze({
      version: BROWSER_SESSION_HANDOFF_V1,
      ttlSeconds,
      allowedTargetOrigins: allowedOrigins,
      rawSourceSessionSecretPersisted: false,
      rawHandoffCodePersisted: false,
      oneTimeRedemptionRequired: true,
      browserBindingRequired: true,
      browserBindingMethod: "S256",
    }),

    async issue({ headers = {}, targetOrigin, codeChallenge } = {}) {
      const normalizedTargetOrigin = requireAllowedTargetOrigin(targetOrigin);
      const normalizedChallenge = normalizeCodeChallenge(codeChallenge);
      const authentication = await sourceAuthenticator.authenticate(headers);
      const principal = normalizePrincipal(authentication);
      const issuedAtDate = normalizeNow(now);
      const expiresAtDate = new Date(issuedAtDate.getTime() + ttlSeconds * 1000);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const code = normalizeCode(generateCode());
        const key = recordKey(code);
        const record = Object.freeze({
          version: BROWSER_SESSION_HANDOFF_V1,
          status: "active",
          targetOrigin: normalizedTargetOrigin,
          codeChallenge: normalizedChallenge,
          issuedAt: issuedAtDate.toISOString(),
          expiresAt: expiresAtDate.toISOString(),
          principal,
        });

        const stored = await store.putIfAbsent(key, record);

        if (stored === true) {
          return Object.freeze({
            version: BROWSER_SESSION_HANDOFF_V1,
            code,
            targetOrigin: normalizedTargetOrigin,
            expiresAt: expiresAtDate.toISOString(),
          });
        }

        if (stored !== false) {
          throw new TypeError("store.putIfAbsent must resolve to boolean");
        }
      }

      throw new BrowserSessionHandoffError("handoff_code_generation_exhausted", { status: 503 });
    },

    async redeem({ code, targetOrigin, codeVerifier } = {}) {
      const normalizedCode = normalizeCode(code);
      const normalizedTargetOrigin = requireAllowedTargetOrigin(targetOrigin);
      const normalizedCodeVerifier = normalizeCodeVerifier(codeVerifier);
      const record = await store.take(recordKey(normalizedCode));

      if (
        !record ||
        typeof record !== "object" ||
        record.version !== BROWSER_SESSION_HANDOFF_V1 ||
        record.status !== "active"
      ) {
        throw new BrowserSessionHandoffError("handoff_invalid_expired_or_redeemed", { status: 401 });
      }

      if (record.targetOrigin !== normalizedTargetOrigin) {
        throw new BrowserSessionHandoffError("handoff_target_mismatch", { status: 403 });
      }

      const current = normalizeNow(now);
      const expiresAt = Date.parse(record.expiresAt);
      const issuedAt = Date.parse(record.issuedAt);

      if (
        Number.isNaN(expiresAt) ||
        Number.isNaN(issuedAt) ||
        expiresAt <= issuedAt ||
        expiresAt <= current.getTime()
      ) {
        throw new BrowserSessionHandoffError("handoff_invalid_expired_or_redeemed", { status: 401 });
      }

      if (
        typeof record.codeChallenge !== "string" ||
        !HANDOFF_CHALLENGE.test(record.codeChallenge) ||
        !secureEqual(deriveCodeChallenge(normalizedCodeVerifier), record.codeChallenge)
      ) {
        throw new BrowserSessionHandoffError("handoff_browser_binding_mismatch", { status: 401 });
      }

      const principal = normalizePrincipal({ role: "client", principal: record.principal });

      return Object.freeze({
        version: BROWSER_SESSION_HANDOFF_V1,
        authenticated: true,
        principal: publicPrincipal(principal),
        source: Object.freeze({
          authenticationMethod: "browser_session_handoff",
          ...(principal.sourceAuthenticationMethod
            ? { sourceAuthenticationMethod: principal.sourceAuthenticationMethod }
            : {}),
          issuedAt: record.issuedAt,
          expiresAt: record.expiresAt,
          targetOrigin: normalizedTargetOrigin,
          browserBindingMethod: "S256",
        }),
      });
    },
  });
}
