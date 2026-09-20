import crypto from "node:crypto";

const DEFAULT_CHALLENGE_BYTES = 32;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_RP_ID = "apidevelopers.digital";
const DEFAULT_RP_NAME = "API Developers Trust";

export class TrustFaceAccessError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "TrustFaceAccessError";
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

export function fromBase64Url(value) {
  const normalized = String(value ?? "").replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64");
}

export function createInMemoryTrustFaceAccessStore({ now = () => Date.now() } = {}) {
  const challenges = new Map();
  const credentials = new Map();

  function pruneExpired() {
    const current = now();
    for (const [challenge, record] of challenges.entries()) {
      if (record.expiresAt <= current) challenges.delete(challenge);
    }
  }

  return Object.freeze({
    saveChallenge(record) {
      pruneExpired();
      challenges.set(record.challenge, Object.freeze({ ...record }));
      return record.challenge;
    },
    consumeChallenge({ challenge, type, userId }) {
      pruneExpired();
      const stored = challenges.get(challenge);
      if (!stored) throw new TrustFaceAccessError("challenge_not_found");
      if (stored.type !== type) throw new TrustFaceAccessError("challenge_type_mismatch");
      if (stored.userId !== userId) throw new TrustFaceAccessError("challenge_user_mismatch");
      challenges.delete(challenge);
      return stored;
    },
    saveCredential(record) {
      const userCredentials = credentials.get(record.userId) ?? new Map();
      userCredentials.set(record.credentialId, Object.freeze({ ...record }));
      credentials.set(record.userId, userCredentials);
      return record.credentialId;
    },
    listCredentialDescriptors(userId) {
      return [...(credentials.get(userId)?.values() ?? [])].map((credential) => Object.freeze({
        type: "public-key",
        id: credential.credentialId,
        transports: credential.transports ?? [],
      }));
    },
    getCredential({ userId, credentialId }) {
      return credentials.get(userId)?.get(credentialId) ?? null;
    },
  });
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TrustFaceAccessError(`${field}_required`);
  }
  return value.trim();
}

function createChallenge({ bytes = DEFAULT_CHALLENGE_BYTES } = {}) {
  return toBase64Url(crypto.randomBytes(bytes));
}

function userHandleFor(userId) {
  return toBase64Url(crypto.createHash("sha256").update(String(userId)).digest().subarray(0, 32));
}

export function createTrustFaceAccessService({
  rpId = DEFAULT_RP_ID,
  rpName = DEFAULT_RP_NAME,
  origin = "https://trust.apidevelopers.digital",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  store = createInMemoryTrustFaceAccessStore(),
  now = () => Date.now(),
} = {}) {
  const relyingPartyId = assertNonEmptyString(rpId, "rp_id");
  const relyingPartyName = assertNonEmptyString(rpName, "rp_name");
  const expectedOrigin = assertNonEmptyString(origin, "origin");

  function expiresAt() {
    return now() + timeoutMs;
  }

  return Object.freeze({
    status() {
      return Object.freeze({
        service: "trust-face-access",
        status: "preview",
        mode: "passkeys_webauthn",
        rpId: relyingPartyId,
        origin: expectedOrigin,
        storesBiometricTemplate: false,
        storesFaceImage: false,
      });
    },

    createRegistrationOptions({ userId, userName, displayName = userName } = {}) {
      const normalizedUserId = assertNonEmptyString(userId, "user_id");
      const normalizedUserName = assertNonEmptyString(userName, "user_name");
      const challenge = createChallenge();

      store.saveChallenge({
        type: "registration",
        challenge,
        userId: normalizedUserId,
        expiresAt: expiresAt(),
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
          excludeCredentials: Object.freeze(store.listCredentialDescriptors(normalizedUserId)),
        }),
      });
    },

    createAuthenticationOptions({ userId } = {}) {
      const normalizedUserId = assertNonEmptyString(userId, "user_id");
      const challenge = createChallenge();

      store.saveChallenge({
        type: "authentication",
        challenge,
        userId: normalizedUserId,
        expiresAt: expiresAt(),
      });

      return Object.freeze({
        publicKey: Object.freeze({
          challenge,
          rpId: relyingPartyId,
          allowCredentials: Object.freeze(store.listCredentialDescriptors(normalizedUserId)),
          timeout: timeoutMs,
          userVerification: "required",
        }),
      });
    },

    registerCredentialPreview({ userId, challenge, credentialId, transports = [] } = {}) {
      const normalizedUserId = assertNonEmptyString(userId, "user_id");
      const normalizedChallenge = assertNonEmptyString(challenge, "challenge");
      const normalizedCredentialId = assertNonEmptyString(credentialId, "credential_id");

      store.consumeChallenge({
        type: "registration",
        challenge: normalizedChallenge,
        userId: normalizedUserId,
      });

      store.saveCredential({
        userId: normalizedUserId,
        credentialId: normalizedCredentialId,
        transports: Array.isArray(transports) ? transports : [],
        createdAt: new Date(now()).toISOString(),
      });

      return Object.freeze({
        registered: true,
        credentialId: normalizedCredentialId,
        mode: "preview_without_attestation_verification",
      });
    },
  });
}
