import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

function requireSecret(value, name = "apiKey") {
  if (typeof value !== "string" || value.length < 8) {
    throw new TypeError(`${name} must be a string with at least 8 characters`);
  }
  return value;
}

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
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
  tenantId,
  name,
  scopes = [],
  prefix,
  keyHash,
  createdAt,
} = {}) {
  if (apiKey !== undefined) {
    const secret = requireSecret(apiKey);
    return Object.freeze({
      id,
      prefix: secret.slice(0, 12),
      hash: hashApiKey(secret),
      status: "active",
      createdAt: clock(),
      revokedAt: null,
      revocationReason: null,
    });
  }

  const normalizedPrefix = requireText(prefix, "prefix");
  const normalizedHash = requireText(keyHash, "keyHash");
  if (!/^[a-f0-9]{64}$/i.test(normalizedHash) && !/^hash_[a-z0-9_]+$/i.test(normalizedHash)) {
    throw new TypeError("keyHash must be a SHA-256 hash");
  }

  return Object.freeze({
    id: requireText(id, "id"),
    tenantId: requireText(tenantId, "tenantId"),
    name: requireText(name, "name"),
    prefix: normalizedPrefix,
    hash: normalizedHash,
    scopes: Object.freeze([...new Set(scopes.map((scope) => requireText(scope, "scope")))]),
    status: "active",
    createdAt: requireText(createdAt ?? clock(), "createdAt"),
    revokedAt: null,
    revocationReason: null,
  });
}

export function revokeApiKeyRecord(
  record,
  {
    clock = () => new Date().toISOString(),
    revokedAt,
    reason = "revoked",
  } = {},
) {
  if (!record || typeof record !== "object") throw new TypeError("API key record is required");
  if (record.status === "revoked") return Object.freeze({ ...record });
  return Object.freeze({
    ...record,
    status: "revoked",
    revokedAt: revokedAt ?? clock(),
    revocationReason: requireText(reason, "reason"),
  });
}

export function isApiKeyRecordActive(record) {
  return record?.status === "active" && record?.revokedAt == null;
}

export function toPublicApiKeyRecord(record) {
  if (!record) return null;
  const { hash: _hash, keyHash: _keyHash, ...safe } = record;
  return structuredClone(safe);
}

export { createDurableApiKeyRepository } from "./durable-repository.mjs";
export { createApiKeyLifecycleService } from "./lifecycle-service.mjs";
