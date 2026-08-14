import { constants, createHash, createPublicKey, randomBytes, verify } from "node:crypto";

export const TRUST_EVALUATION_RECIPIENT_KEY_PROOF_VERSION =
  "trust-evaluation-recipient-key-proof/v1";
export const TRUST_EVALUATION_RECIPIENT_KEY_PROOF_ALGORITHM = "RSA-PSS-SHA256";

const COLLECTION = "trust.evaluation.recipient_key_challenges";
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MIN_TTL_MS = 60 * 1000;
const MAX_TTL_MS = 15 * 60 * 1000;

function fail(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  throw error;
}

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail("TRUST_EVALUATION_KEY_PROOF_INVALID_INPUT", `${name} is required`);
  return normalized;
}

function toB64u(value) {
  return Buffer.from(value).toString("base64url");
}

function fromB64u(value, name) {
  const normalized = requireText(value, name);
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    fail("TRUST_EVALUATION_KEY_PROOF_INVALID_ENCODING", `${name} must use base64url without padding`);
  }
  const decoded = Buffer.from(normalized, "base64url");
  if (!decoded.length || decoded.toString("base64url") !== normalized) {
    fail("TRUST_EVALUATION_KEY_PROOF_INVALID_ENCODING", `${name} is not canonical base64url`);
  }
  return decoded;
}

function normalizePublicKey(recipientPublicKey) {
  if (
    typeof recipientPublicKey === "string" &&
    recipientPublicKey.includes("PRIVATE KEY")
  ) {
    fail(
      "TRUST_EVALUATION_KEY_PROOF_PRIVATE_KEY_REJECTED",
      "recipientPublicKey must not contain private-key material",
    );
  }

  let key;
  try {
    key = createPublicKey(recipientPublicKey);
  } catch (cause) {
    fail(
      "TRUST_EVALUATION_KEY_PROOF_INVALID_PUBLIC_KEY",
      "recipientPublicKey is invalid",
      cause,
    );
  }

  if (key.asymmetricKeyType !== "rsa") {
    fail(
      "TRUST_EVALUATION_KEY_PROOF_UNSUPPORTED_PUBLIC_KEY",
      "recipientPublicKey must be RSA",
    );
  }

  const modulusLength = Number(key.asymmetricKeyDetails?.modulusLength ?? 0);
  if (!Number.isSafeInteger(modulusLength) || modulusLength < 2048) {
    fail(
      "TRUST_EVALUATION_KEY_PROOF_WEAK_PUBLIC_KEY",
      "recipientPublicKey must use an RSA modulus of at least 2048 bits",
    );
  }

  return key;
}

function fingerprintPublicKey(key) {
  const spki = key.export({ type: "spki", format: "der" });
  return createHash("sha256").update(spki).digest("base64url");
}

function normalizeTtlMs(value) {
  const ttlMs = value ?? DEFAULT_TTL_MS;
  if (
    "Number.isSafeInteger(ttlMs)" &&
    ttlMs >= MIN_TTL_MS &&
    ttlMs <= MAX_TTL_MS
  ) {
    return ttlMs;
  }
  fail(
    "TRUST_EVALUATION_KEY_PROOF_INVALID_TTL",
    "ttlMs must be an integer between 1 and 15 minutes",
  );
}

function iso(value, name) {
  const normalized = requireText(value, name);
  if (Number.isNaN(Date.parse(normalized)) {
    fail("TRUST_EVALUATION_KEY_PROOF_INVALID_TIME", `${name} must be an ISO-8601 date`);
  }
  return normalized;
}

function coreStatement({
  organizationId,
  recipientKeyFingerprint,
  challengeB64u,
  issuedAt,
  expiresAt,
  correlationId,
}) {
  return Object.freeze({
    version: TRUST_EVALUATION_RECIPIENT_KEY_PROOF_VERSION,
    algorithm: TRUST_EVALUATION_RECIPIENT_KEY_PROOF_ALGORITHM,
    organizationId: requireText(organizationId, "organizationId"),
    recipientKeyFingerprint: requireText(
      recipientKeyFingerprint,
      "recipientKeyFingerprint",
    ),
    challengeB64u: requireText(challengeB64u, "challengeB64u"),
    issuedAt: iso(issuedAt, "issuedAt"),
    expiresAt: iso(expiresAt, "expiresAt"),
    correlationId: requireText(correlationId, "correlationId"),
  });
}

function challengeIdFor(statement) {
  return createHash("sha256")
    .update(JSON.stringify(statement), "utf8")
    .digest("base64url");
}

function signingPayload(record) {
  return Buffer.from(
    JSON.stringify({
      ...coreStatement(record),
      challengeId: requireText(record.challengeId, "challengeId"),
    }),
    "utf8",
  );
}

function publicChallenge(record) {
  return Object.freeze({
    version: record.version,
    algorithm: record.algorithm,
    challengeId: record.challengeId,
    organizationId: record.organizationId,
    recipientKeyFingerprint: record.recipientKeyFingerprint,
    challengeB64u: record.challengeB64u,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    correlationId: record.correlationId,
    signingPayloadB64u: toB64u(signingPayload(record)),
  });
}

export function createTrustEvaluationRecipientKeyProofService({
  store,
  clock = () => new Date().toISOString(),
  randomBytesFn = randomBytes,
} = {}) {
  if (
    !store ||
    typeof store.read !== "function" ||
    typeof store.transaction !== "function"
  ) {
    fail(
      "TRUST_EVALUATION_KEY_PROOF_INVALID_STORE",
      "store must provide read and transaction",
    );
  }
  if (typeof clock !== "function" || typeof randomBytesFn !== "function") {
    fail(
      "TRUST_EVALUATION_KEY_PROOF_INVALID_DEPENDENCY",
      "clock and randomBytesFn must be functions",
    );
  }

  return Object.freeze({
    async issueChallenge({
      organizationId,
      recipientPublicKey,
      correlationId,
      ttlMs: ttlInput,
    } = {}) {
      const publicKey = normalizePublicKey(recipientPublicKey);
      const issuedAt = iso(clock(), "clock()");
      const ttlMs = normalizeTtlMs(ttlInput);
      const expiresAt = new Date(Date.parse(issuedAt) + ttlMs).toISOString();
      const nonce = Buffer.from(randomBytesFn(32));
      if (nonce.length < 32) {
        fail(
          "TRUST_EVALUATION_KEY_PROOF_WEAK_CHALLENGE",
          "randomBytesFn must return at least 32 bytes",
        );
      }

      const statement = coreStatement({
        organizationId,
        recipientKeyFingerprint: fingerprintPublicKey(publicKey),
        challengeB64u: toB64u(nonce),
        issuedAt,
        expiresAt,
        correlationId,
      });
      const challengeId = challengeIdFor(statement);
      const record = Object.freeze({
        ...statement,
        challengeId,
        status: "active",
        consumedAt: null,
        verification: null,
      });

      const committed = await store.transaction((tx) => {
        if (tx.get(COLLECTION, challengeId)) {
          fail(
            "TRUST_EVALUATION_KEY_PROOF_CHALLENGE_CONFLICT",
            "challenge already exists",
          );
        }
        tx.put(COLLECTION, challengeId, record, { ifAbsent: true });
        return record;
      });

      return publicChallenge(committed.result);
    },

    async verifyAndConsume({
      challengeId,
      recipientPublicKey,
      signatureB64u,
    } = {}) {
      const id = requireText(challengeId, "challengeId");
      const publicKey = normalizePublicKey(recipientPublicKey);
      const fingerprint = fingerprintPublicKey(publicKey);
      const signature = fromB64u(signatureB64u, "signatureB64u");
      const verifiedAt = iso(clock(), "clock()");

      const committed = await store.transaction((tx) => {
        const record = tx.get(COLLECTION, id);
        if (!record) {
          fail(
            "TRUST_EVALUATION_KEY_PROOF_CHALLENGE_NOT_FOUND",
            "recipient key challenge was not found",
          );
        }
        if (record.status !== "active") {
          fail(
            "TRUST_EVALUATION_KEY_PROOF_REPLAY",
            "recipient key challenge was already consumed",
          );
        }
        if (Date.parse(verifiedAt) >= Date.parse(record.expiresAt)) {
          fail(
            "TRUST_EVALUATION_KEY_PROOF_EXPIRED",
            "recipient key challenge has expired",
          );
        }
        if (record.recipientKeyFingerprint !== fingerprint) {
          fail(
            "TRUST_EVALUATION_KEY_PROOF_RECIPIENT_MISMATCH",
            "recipient public key does not match the challenge",
          );
        }

        const valid = verify(
          "sha256",
          signingPayload(record),
          {
            key: publicKey,
            padding: constants.RSA_PKCS1_PSS_PADDING,
            saltLength: 32,
          },
          signature,
        );
        if (!valid) {
          fail(
            "TRUST_EVALUATION_KEY_PROOF_INVALID_SIGNATURE",
            "recipient key proof signature is invalid",
          );
        }

        const proof = Object.freeze({
          version: TRUST_EVALUATION_RECIPIENT_KEY_PROOF_VERSION,
          algorithm: TRUST_EVALUATION_RECIPIENT_KEY_PROOF_ALGORITHM,
          challengeId: record.challengeId,
          organizationId: record.organizationId,
          recipientKeyFingerprint: fingerprint,
          correlationId: record.correlationId,
          verifiedAt,
          keyPossessionVerified: true,
          identityVerified: false,
        });

        tx.put(COLLECTION, id, {
          ...record,
          status: "consumed",
          consumedAt: verifiedAt,
          verification: {
            keyPossessionVerified: true,
            identityVerified: false,
            verifiedAt,
          },
        });

        return proof;
      });

      return committed.result;
    },
  });
}
