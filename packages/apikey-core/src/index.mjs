import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

function requireSecret(value, name = "apiKey") {
  if (typeof value !== "string" || value.length < 8) {
    throw new TypeError(`${name} must be a string with at least 8 characters`);
  }
  return value;
}

export function hashApiKey(apiKey) {
  return createHash("sha256").update(requireSecret(apiKey)).digest("hex");
}

export function secureCompareSecrets(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

export function verifyApiKeyHash(apiKey, expectedHash) {
  if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const candidate = Buffer.from(hashApiKey(apiKey), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return timingSafeEqual(candidate, expected);
}

export function generateApiKey({
  prefix = "apid",
  bytes = 24,
  randomBytesFactory = randomBytes,
} = {}) {
  if (!/^[a-z][a-z0-9_-]{1,15}$/.test(prefix)) {
    throw new TypeError("prefix must be a lowercase API key namespace");
  }
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > 64) {
    throw new TypeError("bytes must be an integer between 16 and 64");
  }
  return `${prefix}_${randomBytesFactory(bytes).toString("base64url")}`;
}

export function createApiKeyRecord({
  apiKey,
  id = randomUUID(),
  clock = () => new Date().toISOString(),
  prefixLength = 12,
} = {}) {
  const secret = requireSecret(apiKey);
  return Object.freeze({
    id,
    prefix: secret.slice(0, prefixLength),
    hash: hashApiKey(secret),
    status: "active",
    createdAt: clock(),
    revokedAt: null,
  });
}

export function revokeApiKeyRecord(record, { clock = () => new Date().toISOString() } = {}) {
  if (!record || typeof record !== "object") throw new TypeError("API key record is required");
  if (record.status === "revoked") return Object.freeze({ ...record });
  return Object.freeze({ ...record, status: "revoked", revokedAt: clock() });
}

export function isApiKeyRecordActive(record) {
  return record?.status === "active" && record?.revokedAt == null;
}

export function toPublicApiKeyRecord(record) {
  if (!record) return null;
  const { hash: _hash, ...safe } = record;
  return structuredClone(safe);
}
