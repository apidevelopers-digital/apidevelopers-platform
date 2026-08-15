import {
  createHash,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  publicEncrypt,
} from "node:crypto";

export const TRUST_EVALUATION_CREDENTIAL_ENVELOPE_VERSION =
  "trust-evaluation-credential-envelope/v1";
export const TRUST_EVALUATION_CREDENTIAL_ENVELOPE_ALGORITHM =
  "RSA-OAEP-SHA256";

function fail(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  throw error;
}

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_INVALID_INPUT",
      `${name} is required`,
    );
  }
  return normalized;
}

function toB64u(value) {
  return Buffer.from(value).toString("base64url");
}

function fromB64u(value, name) {
  const normalized = requireText(value, name);
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_INVALID_ENCODING",
      `${name} must use base64url without padding`,
    );
  }
  const decoded = Buffer.from(normalized, "base64url");
  if (!decoded.length || decoded.toString("base64url") !== normalized) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_INVALID_ENCODING",
      `${name} is not canonical base64url`,
    );
  }
  return decoded;
}

function canonicalContext(context = {}) {
  return JSON.stringify({
    version: TRUST_EVALUATION_CREDENTIAL_ENVELOPE_VERSION,
    tenantId: requireText(context.tenantId, "context.tenantId"),
    apiKeyId: requireText(context.apiKeyId, "context.apiKeyId"),
    expiresAt: requireText(context.expiresAt, "context.expiresAt"),
    correlationId: requireText(context.correlationId, "context.correlationId"),
  });
}

function contextDigest(context) {
  return createHash("sha256").update(canonicalContext(context), "utf8").digest();
}

function normalizeRecipientPublicKey(recipientPublicKey) {
  if (
    typeof recipientPublicKey === "string"
    && recipientPublicKey.includes("PRIVATE KEY")
  ) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_PRIVATE_KEY_REJECTED",
      "recipientPublicKey must not contain a private key",
    );
  }

  let key;
  try {
    key = createPublicKey(recipientPublicKey);
  } catch (cause) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_INVALID_PUBLIC_KEY",
      "recipientPublicKey is invalid",
      cause,
    );
  }

  if (key.asymmetricKeyType !== "rsa") {
    fail(
      "TRUST_EVALUATION_ENVELOPE_UNSUPPORTED_PUBLIC_KEY",
      "recipientPublicKey must be RSA",
    );
  }

  const modulusLength = Number(key.asymmetricKeyDetails?.modulusLength ?? 0);
  if (!Number.isSafeInteger(modulusLength) || modulusLength < 2048) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_WEAK_PUBLIC_KEY",
      "recipientPublicKey must use an RSA modulus of at least 2048 bits",
    );
  }

  return key;
}

function fingerprintPublicKey(key) {
  const spki = key.export({ type: "spki", format: "der" });
  return createHash("sha256").update(spki).digest("base64url");
}

function normalizeEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") {
    fail(
      "TRUST_EVALUATION_ENVELOPE_INVALID_INPUT",
      "envelope is required",
    );
  }

  if (envelope.version !== TRUST_EVALUATION_CREDENTIAL_ENVELOPE_VERSION) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_UNSUPPORTED_VERSION",
      "credential envelope version is unsupported",
    );
  }

  if (envelope.algorithm !== TRUST_EVALUATION_CREDENTIAL_ENVELOPE_ALGORITHM) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_UNSUPPORTED_ALGORITHM",
      "credential envelope algorithm is unsupported",
    );
  }

  const recipientKeyFingerprint = requireText(
    envelope.recipientKeyFingerprint,
    "envelope.recipientKeyFingerprint",
  );
  const context = Object.freeze({
    tenantId: requireText(envelope.context?.tenantId, "envelope.context.tenantId"),
    apiKeyId: requireText(envelope.context?.apiKeyId, "envelope.context.apiKeyId"),
    expiresAt: requireText(envelope.context?.expiresAt, "envelope.context.expiresAt"),
    correlationId: requireText(
      envelope.context?.correlationId,
      "envelope.context.correlationId",
    ),
  });
  const expectedDigest = contextDigest(context);
  const receivedDigest = fromB64u(
    envelope.contextDigestB64u,
    "envelope.contextDigestB64u",
  );

  if (
    receivedDigest.length !== expectedDigest.length
    || !receivedDigest.equals(expectedDigest)
  ) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_CONTEXT_MISMATCH",
      "credential envelope context digest does not match",
    );
  }

  return Object.freeze({
    recipientKeyFingerprint,
    context,
    contextDigest: expectedDigest,
    ciphertext: fromB64u(
      envelope.ciphertextB64u,
      "envelope.ciphertextB64u",
    ),
  });
}

export function createTrustEvaluationCredentialEnvelopeHandoff({
  recipientPublicKey,
  deliverEnvelope,
} = {}) {
  const publicKey = normalizeRecipientPublicKey(recipientPublicKey);
  if (typeof deliverEnvelope !== "function") {
    fail(
      "TRUST_EVALUATION_ENVELOPE_INVALID_DELIVERY_SINK",
      "deliverEnvelope must be a function",
    );
  }

  const recipientKeyFingerprint = fingerprintPublicKey(publicKey);

  return Object.freeze({
    mode: "sealed_envelope",
    algorithm: TRUST_EVALUATION_CREDENTIAL_ENVELOPE_ALGORITHM,
    recipientKeyFingerprint,

    async deliver({
      secret,
      tenantId,
      apiKeyId,
      expiresAt,
      correlationId,
    } = {}) {
      const normalizedSecret = requireText(secret, "secret");
      const context = Object.freeze({
        tenantId: requireText(tenantId, "tenantId"),
        apiKeyId: requireText(apiKeyId, "apiKeyId"),
        expiresAt: requireText(expiresAt, "expiresAt"),
        correlationId: requireText(correlationId, "correlationId"),
      });
      const digest = contextDigest(context);

      let ciphertext;
      try {
        ciphertext = publicEncrypt(
          {
            key: publicKey,
            oaepHash: "sha256",
            oaepLabel: digest,
          },
          Buffer.from(normalizedSecret, "utf8"),
        );
      } catch (cause) {
        fail(
          "TRUST_EVALUATION_ENVELOPE_ENCRYPT_FAILED",
          "credential envelope encryption failed",
          cause,
        );
      }

      const envelope = Object.freeze({
        version: TRUST_EVALUATION_CREDENTIAL_ENVELOPE_VERSION,
        algorithm: TRUST_EVALUATION_CREDENTIAL_ENVELOPE_ALGORITHM,
        recipientKeyFingerprint,
        context,
        contextDigestB64u: toB64u(digest),
        ciphertextB64u: toB64u(ciphertext),
      });

      await deliverEnvelope(envelope);

      return Object.freeze({
        mode: "sealed_envelope",
        algorithm: TRUST_EVALUATION_CREDENTIAL_ENVELOPE_ALGORITHM,
        recipientKeyFingerprint,
        contextDigestB64u: envelope.contextDigestB64u,
      });
    },
  });
}

export function openTrustEvaluationCredentialEnvelope({
  envelope,
  recipientPrivateKey,
} = {}) {
  const normalized = normalizeEnvelope(envelope);

  let privateKey;
  try {
    privateKey = createPrivateKey(recipientPrivateKey);
  } catch (cause) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_INVALID_PRIVATE_KEY",
      "recipientPrivateKey is invalid",
      cause,
    );
  }

  const recipientFingerprint = fingerprintPublicKey(createPublicKey(privateKey));
  if (recipientFingerprint !== normalized.recipientKeyFingerprint) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_RECIPIENT_MISMATCH",
      "recipient private key does not match credential envelope",
    );
  }

  let plaintext;
  try {
    plaintext = privateDecrypt(
      {
        key: privateKey,
        oaepHash: "sha256",
        oaepLabel: normalized.contextDigest,
      },
      normalized.ciphertext,
    );
  } catch (cause) {
    fail(
      "TRUST_EVALUATION_ENVELOPE_DECRYPT_FAILED",
      "credential envelope decryption failed",
      cause,
    );
  }

  return plaintext.toString("utf8");
}
