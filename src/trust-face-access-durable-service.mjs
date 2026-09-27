import crypto from "node:crypto";

import { createInMemoryTrustFaceAccessDurableStore } from "./trust-face-access-durable-store.mjs";

const DEFAULT_CHALLENGE_BYTES = 32;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_RP_ID = "apidevelopers.digital";
const DEFAULT_RP_NAME = "API Developers Trust";
const DEFAULT_TRUST_LOGIN_TOKEN_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TRUST_LOGIN_AUDIENCES = Object.freeze({
  zuni: Object.freeze([
    "https://zuni.sitedauni.com/trust-callback.php",
    "https://zuni.sitedauni.com/trust/callback",
  ]),
});

export class TrustFaceAccessDurableServiceError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "TrustFaceAccessDurableServiceError";
    this.code = code;
  }
}

export function toBase64Url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TrustFaceAccessDurableServiceError(`${field}_required`);
  }
  return value.trim();
}

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function createChallenge({ bytes = DEFAULT_CHALLENGE_BYTES } = {}) {
  return toBase64Url(crypto.randomBytes(bytes));
}

function userHandleFor(userId) {
  return toBase64Url(crypto.createHash("sha256").update(String(userId)).digest().subarray(0, 32));
}

function expiresAt({ nowMs, timeoutMs }) {
  return new Date(nowMs() + timeoutMs).toISOString();
}

function normalizeTransports(transports) {
  return Array.isArray(transports) ? transports.filter((transport) => typeof transport === "string" && transport.trim() !== "") : [];
}

function unixSeconds(ms) {
  return Math.floor(ms / 1000);
}

function normalizeAllowedTrustLoginAudiences(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_TRUST_LOGIN_AUDIENCES;
  const entries = Object.entries(value)
    .map(([audience, returnUrls]) => [
      String(audience).trim(),
      Array.isArray(returnUrls)
        ? returnUrls.map((returnUrl) => String(returnUrl).trim()).filter(Boolean)
        : [],
    ])
    .filter(([audience, returnUrls]) => audience !== "" && returnUrls.length > 0);
  return Object.freeze(Object.fromEntries(entries.map(([audience, returnUrls]) => [audience, Object.freeze(returnUrls)])));
}

function normalizeTrustLoginRequest({ audience, returnUrl, allowedAudiences }) {
  const normalizedAudience = optionalText(audience);
  if (!normalizedAudience) return undefined;
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/u.test(normalizedAudience)) {
    throw new TrustFaceAccessDurableServiceError("trust_login_audience_invalid");
  }
  const allowedReturnUrls = allowedAudiences[normalizedAudience];
  if (!allowedReturnUrls) {
    throw new TrustFaceAccessDurableServiceError("trust_login_audience_not_allowed");
  }
  const normalizedReturnUrl = optionalText(returnUrl);
  if (normalizedReturnUrl && !allowedReturnUrls.includes(normalizedReturnUrl)) {
    throw new TrustFaceAccessDurableServiceError("trust_login_return_url_not_allowed");
  }
  return Object.freeze({
    audience: normalizedAudience,
    returnUrl: normalizedReturnUrl ?? allowedReturnUrls[0],
  });
}

function signTrustLoginToken({ secret, payload }) {
  const header = Object.freeze({ alg: "HS256", typ: "JWT" });
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = toBase64Url(crypto.createHmac("sha256", secret).update(signingInput).digest());
  return `${signingInput}.${signature}`;
}

function createTrustLoginToken({ secret, audience, returnUrl, userId, email, credentialId, nowMs, ttlMs }) {
  const normalizedSecret = optionalText(secret);
  if (!normalizedSecret) {
    throw new TrustFaceAccessDurableServiceError("trust_login_token_secret_not_configured");
  }
  const issuedAtMs = nowMs();
  const expiresAtMs = issuedAtMs + ttlMs;
  const payload = Object.freeze({
    iss: "api-developers-trust",
    aud: audience,
    purpose: "session_exchange",
    sub: userId,
    email: email ?? null,
    credentialId,
    returnUrl,
    iat: unixSeconds(issuedAtMs),
    exp: unixSeconds(expiresAtMs),
    nonce: toBase64Url(crypto.randomBytes(18)),
  });
  return Object.freeze({
    token: signTrustLoginToken({ secret: normalizedSecret, payload }),
    expiresAt: new Date(expiresAtMs).toISOString(),
    audience,
    returnUrl,
  });
}

export function createTrustFaceAccessDurableService({
  rpId = DEFAULT_RP_ID,
  rpName = DEFAULT_RP_NAME,
  origin = "https://trust.apidevelopers.digital",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  store = createInMemoryTrustFaceAccessDurableStore(),
  nowMs = () => Date.now(),
  nowIso = () => new Date(nowMs()).toISOString(),
  trustLoginTokenSecret = process.env.TRUST_FACE_ACCESS_LOGIN_TOKEN_SECRET,
  trustLoginTokenTtlMs = DEFAULT_TRUST_LOGIN_TOKEN_TTL_MS,
  trustLoginAudiences = DEFAULT_TRUST_LOGIN_AUDIENCES,
} = {}) {
  const relyingPartyId = assertNonEmptyString(rpId, "rp_id");
  const relyingPartyName = assertNonEmptyString(rpName, "rp_name");
  const expectedOrigin = assertNonEmptyString(origin, "origin");
  const allowedTrustLoginAudiences = normalizeAllowedTrustLoginAudiences(trustLoginAudiences);

  if (!store || typeof store.saveChallenge !== "function" || typeof store.consumeChallenge !== "function" || typeof store.saveCredential !== "function" || typeof store.listCredentialDescriptors !== "function" || typeof store.getCredential !== "function") {
    throw new TypeError("store must expose saveChallenge, consumeChallenge, saveCredential, listCredentialDescriptors and getCredential functions");
  }

  return Object.freeze({
    status() {
      return Object.freeze({
        service: "trust-face-access",
        status: "durable_preview",
        mode: "passkeys_webauthn",
        rpId: relyingPartyId,
        origin: expectedOrigin,
        storesBiometricTemplate: false,
        storesFaceImage: false,
        storesPublicCredentials: true,
      });
    },

    async createRegistrationOptions({ userId, userName, displayName = userName } = {}) {
      const normalizedUserId = assertNonEmptyString(userId, "user_id");
      const normalizedUserName = assertNonEmptyString(userName, "user_name");
      const challenge = createChallenge();

      await store.saveChallenge({
        type: "registration",
        challenge,
        userId: normalizedUserId,
        expiresAt: expiresAt({ nowMs, timeoutMs }),
        createdAt: nowIso(),
      });

      return Object.freeze({
        publicKey: Object.freeze({
          challenge,
          rp: Object.freeze({ id: relyingPartyId, name: relyingPartyName }),
          user: Object.freeze({
            id: userHandleFor(normalizedUserId),
            name: normalizedUserName,
            displayName,
          }),
          pubKeyCredParams: Object.freeze([
            Object.freeze({ type: "public-key", alg: -7 }),
            Object.freeze({ type: "public-key", alg: -257 }),
          ]),
          authenticatorSelection: Object.freeze({
            authenticatorAttachment: "platform",
            residentKey: "preferred",
            userVerification: "required",
          }),
          timeout: timeoutMs,
          attestation: "none",
          excludeCredentials: Object.freeze(await store.listCredentialDescriptors(normalizedUserId)),
        }),
      });
    },

    async createAuthenticationOptions({ userId } = {}) {
      const normalizedUserId = assertNonEmptyString(userId, "user_id");
      const challenge = createChallenge();
      await store.saveChallenge({
        type: "authentication",
        challenge,
        userId: normalizedUserId,
        expiresAt: expiresAt({ nowMs, timeoutMs }),
        createdAt: nowIso(),
      });
      return Object.freeze({
        publicKey: Object.freeze({
          challenge,
          rpId: relyingPartyId,
          allowCredentials: Object.freeze(await store.listCredentialDescriptors(normalizedUserId)),
          timeout: timeoutMs,
          userVerification: "required",
        }),
      });
    },

    async registerCredentialPreview({ userId, userName, displayName, challenge, credentialId, transports = [], publicKey = null, signCount = 0 } = {}) {
      const normalizedUserId = assertNonEmptyString(userId, "user_id");
      const normalizedChallenge = assertNonEmptyString(challenge, "challenge");
      const normalizedCredentialId = assertNonEmptyString(credentialId, "credential_id");
      await store.consumeChallenge({ type: "registration", challenge: normalizedChallenge, userId: normalizedUserId });
      await store.saveCredential({
        userId: normalizedUserId,
        credentialId: normalizedCredentialId,
        userName: userName ?? null,
        displayName: displayName ?? userName ?? null,
        publicKey,
        signCount,
        transports: normalizeTransports(transports),
        rpId: relyingPartyId,
        origin: expectedOrigin,
        createdAt: nowIso(),
        lastUsedAt: null,
        status: "active",
      });
      return Object.freeze({
        registered: true,
        credentialId: normalizedCredentialId,
        mode: "durable_preview_without_attestation_verification",
      });
    },

    async verifyRegistrationPreview(payload = {}) {
      return this.registerCredentialPreview(payload);
    },

    async verifyAuthenticationPreview({ userId, challenge, credentialId, audience, returnUrl } = {}) {
      const normalizedUserId = assertNonEmptyString(userId, "user_id");
      const normalizedChallenge = assertNonEmptyString(challenge, "challenge");
      const normalizedCredentialId = assertNonEmptyString(credentialId, "credential_id");
      await store.consumeChallenge({ type: "authentication", challenge: normalizedChallenge, userId: normalizedUserId });
      const credential = await store.getCredential({ userId: normalizedUserId, credentialId: normalizedCredentialId });
      if (!credential) throw new TrustFaceAccessDurableServiceError("credential_not_found");

      const result = {
        authenticated: true,
        userId: normalizedUserId,
        credentialId: normalizedCredentialId,
        mode: "durable_preview_without_assertion_signature_verification",
      };

      const trustLoginRequest = normalizeTrustLoginRequest({
        audience,
        returnUrl,
        allowedAudiences: allowedTrustLoginAudiences,
      });

      if (trustLoginRequest) {
        const token = createTrustLoginToken({
          secret: trustLoginTokenSecret,
          audience: trustLoginRequest.audience,
          returnUrl: trustLoginRequest.returnUrl,
          userId: normalizedUserId,
          email: credential.userName ?? null,
          credentialId: normalizedCredentialId,
          nowMs,
          ttlMs: trustLoginTokenTtlMs,
        });
        result.trustLoginToken = token.token;
        result.trustLoginTokenType = "HS256_JWT";
        result.trustLoginTokenAudience = token.audience;
        result.trustLoginTokenReturnUrl = token.returnUrl;
        result.trustLoginTokenExpiresAt = token.expiresAt;
      }

      return Object.freeze(result);
    },
  });
}
