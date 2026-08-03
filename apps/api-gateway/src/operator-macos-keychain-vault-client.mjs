import { normalizeOperatorSecretAccess } from "./operator-secret-provider-contract.mjs";

const MAX_SECRET_BYTES = 8192;
const DEFAULT_LEASE_LIFETIME_MS = 60_000;
const MAX_LEASE_LIFETIME_MS = 5 * 60_000;
const SAFE_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CONSUMER_FAILURE = Symbol("operator-macos-keychain-consumer-failure");

export const OPERATOR_MACOS_KEYCHAIN_PRIVATE_KEY_REF =
  "vault://github/operator-macos-keychain/app-private-key";
export const OPERATOR_MACOS_KEYCHAIN_SERVICE =
  "digital.apidevelopers.operator-gateway";
export const OPERATOR_MACOS_KEYCHAIN_ACCOUNT = "github-app-private-key";

export class OperatorMacosKeychainVaultClientError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OperatorMacosKeychainVaultClientError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

class ConsumerFailure extends Error {
  constructor(error) {
    super("keychain lease consumer failed");
    this[CONSUMER_FAILURE] = error;
  }
}

function fail(code, message, details = {}) {
  throw new OperatorMacosKeychainVaultClientError(code, message, details);
}

function normalizeSafeValue(value, field) {
  const normalized = String(value ?? "").trim();
  if (!SAFE_VALUE_PATTERN.test(normalized)) {
    throw new TypeError(`${field} is invalid`);
  }
  return normalized;
}

function normalizeNow(now) {
  if (typeof now !== "function") throw new TypeError("now must be a function");
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("now must return a valid date");
  }
  return date;
}

function normalizeExactRefs(values) {
  if (!Array.isArray(values) || values.length < 1) {
    throw new TypeError("allowedSecretRefs must be a non-empty array");
  }
  return new Set(
    values.map(
      (secretRef) =>
        normalizeOperatorSecretAccess({
          secretRef,
          purpose: "vault.configuration.validate",
        }).secretRef,
    ),
  );
}

function normalizeExactPurposes(values) {
  if (!Array.isArray(values) || values.length < 1) {
    throw new TypeError("allowedPurposes must be a non-empty array");
  }
  return new Set(
    values.map(
      (purpose) =>
        normalizeOperatorSecretAccess({
          secretRef: OPERATOR_MACOS_KEYCHAIN_PRIVATE_KEY_REF,
          purpose,
        }).purpose,
    ),
  );
}

function normalizeLease(rawLease, maxSecretBytes) {
  if (!rawLease || typeof rawLease !== "object" || Array.isArray(rawLease)) {
    fail("keychain_contract_violation", "keychain reader returned an invalid lease");
  }
  if (!(rawLease.bytes instanceof Uint8Array)) {
    fail(
      "keychain_contract_violation",
      "keychain reader must return secret bytes as Uint8Array",
    );
  }
  if (
    rawLease.bytes.byteLength < 1 ||
    rawLease.bytes.byteLength > maxSecretBytes
  ) {
    fail(
      "keychain_contract_violation",
      "keychain secret byte length is outside the allowed range",
    );
  }

  let version;
  if (rawLease.version !== undefined && rawLease.version !== null) {
    version = normalizeSafeValue(rawLease.version, "version");
  }

  return {
    sourceBytes: rawLease.bytes,
    leaseBytes: Buffer.from(rawLease.bytes),
    ...(version ? { version } : {}),
  };
}

export function createOperatorMacosKeychainVaultClient({
  keychainReader,
  allowedSecretRefs = [OPERATOR_MACOS_KEYCHAIN_PRIVATE_KEY_REF],
  allowedPurposes = ["github.app.private-key.sign"],
  service = OPERATOR_MACOS_KEYCHAIN_SERVICE,
  account = OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  now = () => new Date(),
  leaseLifetimeMs = DEFAULT_LEASE_LIFETIME_MS,
  maxSecretBytes = MAX_SECRET_BYTES,
} = {}) {
  if (typeof keychainReader !== "function") {
    throw new TypeError("keychainReader must be a function");
  }
  const refs = normalizeExactRefs(allowedSecretRefs);
  const purposes = normalizeExactPurposes(allowedPurposes);
  const normalizedService = normalizeSafeValue(service, "service");
  const normalizedAccount = normalizeSafeValue(account, "account");

  if (
    !Number.isSafeInteger(leaseLifetimeMs) ||
    leaseLifetimeMs < 1_000 ||
    leaseLifetimeMs > MAX_LEASE_LIFETIME_MS
  ) {
    throw new TypeError("leaseLifetimeMs must be between 1000 and 300000");
  }
  if (
    !Number.isSafeInteger(maxSecretBytes) ||
    maxSecretBytes < 1 ||
    maxSecretBytes > MAX_SECRET_BYTES
  ) {
    throw new TypeError("maxSecretBytes must be between 1 and 8192");
  }
  normalizeNow(now);

  return Object.freeze({
    async withSecretLease(access, consumer) {
      const normalizedAccess = normalizeOperatorSecretAccess(access);
      if (!refs.has(normalizedAccess.secretRef)) {
        fail("keychain_reference_denied", "keychain reference is not allowed");
      }
      if (!purposes.has(normalizedAccess.purpose)) {
        fail("keychain_purpose_denied", "keychain purpose is not allowed");
      }
      if (typeof consumer !== "function") {
        throw new TypeError("consumer must be a function");
      }

      let sourceBytes;
      let leaseBytes;
      try {
        let rawLease;
        try {
          rawLease = await keychainReader(
            Object.freeze({
              service: normalizedService,
              account: normalizedAccount,
            }),
          );
        } catch {
          fail("keychain_unavailable", "macOS Keychain is unavailable");
        }

        sourceBytes =
          rawLease?.bytes instanceof Uint8Array ? rawLease.bytes : undefined;
        const normalizedLease = normalizeLease(rawLease, maxSecretBytes);
        sourceBytes = normalizedLease.sourceBytes;
        leaseBytes = normalizedLease.leaseBytes;
        sourceBytes.fill(0);

        const expiresAt = new Date(
          normalizeNow(now).getTime() + leaseLifetimeMs,
        ).toISOString();

        try {
          return await consumer(
            Object.freeze({
              bytes: leaseBytes,
              ...(normalizedLease.version
                ? { version: normalizedLease.version }
                : {}),
              expiresAt,
            }),
          );
        } catch (error) {
          throw new ConsumerFailure(error);
        }
      } catch (error) {
        if (error?.[CONSUMER_FAILURE]) throw error[CONSUMER_FAILURE];
        if (error instanceof OperatorMacosKeychainVaultClientError) throw error;
        fail("keychain_unavailable", "macOS Keychain is unavailable");
      } finally {
        sourceBytes?.fill(0);
        leaseBytes?.fill(0);
      }
    },
  });
}
