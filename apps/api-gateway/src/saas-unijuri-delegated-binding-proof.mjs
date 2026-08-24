import {
  constants as cryptoConstants,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign as cryptoSign,
} from "node:crypto";

export const UNIJURI_DELEGATED_BINDING_VERSION = "uni-juri-delegated-binding/v1";
export const UNIJURI_DELEGATED_BINDING_ALGORITHM = "RSA-PSS-SHA256";
export const UNIJURI_DELEGATED_BINDING_AUDIENCE = "unico-api-platform:uni-juri";
export const UNIJURI_DELEGATED_BINDING_PRODUCT_ID = "uni-juri";

function requiredText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function toB64u(value) {
  return Buffer.from(value).toString("base64url");
}

function canonicalPayload(input = {}) {
  return JSON.stringify({
    version: UNIJURI_DELEGATED_BINDING_VERSION,
    audience: UNIJURI_DELEGATED_BINDING_AUDIENCE,
    tenantId: requiredText(input.tenantId, "tenantId"),
    workspaceId: requiredText(input.workspaceId, "workspaceId"),
    accessGrantId: requiredText(input.accessGrantId, "accessGrantId"),
    productId: requiredText(input.productId, "productId"),
    principalId: requiredText(input.principalId, "principalId"),
    issuedAt: requiredText(input.issuedAt, "issuedAt"),
    expiresAt: requiredText(input.expiresAt, "expiresAt"),
    nonce: requiredText(input.nonce, "nonce"),
  });
}

function normalizePrivateKey(privateKeyPem) {
  const key = createPrivateKey(requiredText(privateKeyPem, "privateKeyPem"));
  if (key.asymmetricKeyType !== "rsa") {
    throw new TypeError("privateKeyPem must be RSA");
  }
  const modulusLength = Number(key.asymmetricKeyDetails?.modulusLength ?? 0);
  if (!Number.isSafeInteger(modulusLength) || modulusLength < 2048) {
    throw new TypeError("privateKeyPem must use RSA >= 2048 bits");
  }
  return key;
}

export function createUniJuriDelegatedBindingSigner({
  privateKeyPem,
  keyId,
  clock = () => new Date(),
  ttlSeconds = 60,
  nonceFactory = randomUUID,
} = {}) {
  const privateKey = normalizePrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKey);
  const normalizedKeyId = requiredText(keyId, "keyId");
  const ttl = Number(ttlSeconds);

  if (!Number.isSafeInteger(ttl) || ttl < 15 || ttl > 300) {
    throw new TypeError("ttlSeconds must be an integer between 15 and 300");
  }
  if (typeof clock !== "function") throw new TypeError("clock must be a function");
  if (typeof nonceFactory !== "function") throw new TypeError("nonceFactory must be a function");

  return Object.freeze({
    algorithm: UNIJURI_DELEGATED_BINDING_ALGORITHM,
    keyId: normalizedKeyId,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),

    signBinding(binding = {}) {
      const productId = requiredText(binding.productId, "productId");
      if (productId !== UNIJURI_DELEGATED_BINDING_PRODUCT_ID) return null;

      const now = clock();
      const issuedAt = new Date(now).toISOString();
      const expiresAt = new Date(new Date(now).getTime() + ttl * 1000).toISOString();
      const payloadJson = canonicalPayload({
        ...binding,
        productId,
        issuedAt,
        expiresAt,
        nonce: nonceFactory(),
      });
      const payloadB64u = toB64u(payloadJson);
      const signature = cryptoSign(
        "sha256",
        Buffer.from(payloadB64u, "utf8"),
        {
          key: privateKey,
          padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
          saltLength: 32,
        },
      ).toString("base64url");

      return Object.freeze({
        version: UNIJURI_DELEGATED_BINDING_VERSION,
        algorithm: UNIJURI_DELEGATED_BINDING_ALGORITHM,
        keyId: normalizedKeyId,
        proof: `${payloadB64u}.${signature}`,
        expiresAt,
      });
    },
  });
}
