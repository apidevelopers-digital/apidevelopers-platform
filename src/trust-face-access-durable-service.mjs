import crypto from "node:crypto";

import { createInMemoryTrustFaceAccessDurableStore } from "./trust-face-access-durable-store.mjs";

const DEFAULT_CHALLENGE_BYTES = 32;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_RP_ID = "apidevelopers.digital";
const DEFAULT_RP_NAME = "API Developers Trust";

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

export function createTrustFaceAccessDurableService({
  rpId = DEFAULT_RP_ID,
  rpName = DEFAULT_RP_NAME,
  origin = "https://trust.apidevelopers.digital",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  store = createInMemoryTrustFaceAccessDurableStore(),
  nowMs = () => Date.now(),
  nowIso = () => new Date(nowMs()).toISOString(),
} = {}) {
  const relyingPartyId = assertNonEmptyString(rpId, "rp_id");
  const relyingPartyName = assertNonEmptyString(rpName, "rp_name");
  const expectedOrigin = assertNonEmptyString(origin, "origin");

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
          rp: Object.freeze({
            id: relyingPartyId,
            name: relyingPartyName,
          }),
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

    async registerCredentialPreview({
      userId,
      userName,
      displayName,
      challenge,
      credentialId,
      transports = [],
      publicKey = null,
      signCount = 0,
    } = {}) {
      const normalizedUserId = assertNonEmptyString(userId, "user_id");
      const normalizedChallenge = assertNonEmptyString(challenge, "challenge");
      const normalizedCredentialId = assertNonEmptyString(credentialId, "credential_id");

      await store.consumeChallenge({
        type: "registration",
        challenge: normalizedChallenge,
        userId: normalizedUserId,
      });

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

    async verifyAuthenticationPreview({ userId, challenge, credentialId } = {}) {
      const normalizedUserId = assertNonEmptyString(userId, "user_id");
      const normalizedChallenge = assertNonEmptyString(challenge, "challenge");
      const normalizedCredentialId = assertNonEmptyString(credentialId, "credential_id");

      await store.consumeChallenge({
        type: "authentication",
        challenge: normalizedChallenge,
        userId: normalizedUserId,
      });

      const credential = await store.getCredential({
        userId: normalizedUserId,
        credentialId: normalizedCredentialId,
      });

      if (!credential) throw new TrustFaceAccessDurableServiceError("credential_not_found");

      return Object.freeze({
        authenticated: true,
        userId: normalizedUserId,
        credentialId: normalizedCredentialId,
        mode: "durable_preview_without_assertion_signature_verification",
      });
    },
  });
}
