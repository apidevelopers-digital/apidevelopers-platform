import {
  OperatorSecretContractError,
  normalizeOperatorSecretAccess,
} from "./operator-secret-provider-contract.mjs";

const MAX_SECRET_BYTES = 8192;
const DEFAULT_MAX_LEASE_LIFETIME_MS = 5 * 60_000;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CONSUMER_FAILURE = Symbol("operator-vault-consumer-failure");

export class OperatorVaultSecretProviderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OperatorVaultSecretProviderError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function fail(code, message, details = {}) {
  throw new OperatorVaultSecretProviderError(code, message, details);
}

function requireVaultClient(client) {
  if (typeof client?.withSecretLease !== "function") {
    throw new TypeError("vaultClient.withSecretLease must be a function");
  }
  return client;
}

function normalizeExactRefs(values) {
  if (!Array.isArray(values) || values.length < 1) {
    throw new TypeError("allowedSecretRefs must be a non-empty array");
  }
  return new Set(values.map((value) => normalizeOperatorSecretAccess({
    secretRef: value,
    purpose: "vault.configuration.validate",
  }).secretRef));
}

function normalizeNow(now) {
  if (typeof now !== "function") throw new TypeError("now must be a function");
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("now must return a valid date");
  return date;
}

function normalizeLease(rawLease, { now, maxLeaseLifetimeMs }) {
  if (!rawLease || typeof rawLease !== "object" || Array.isArray(rawLease)) {
    fail("vault_contract_violation", "vault returned an invalid lease");
  }
  if (!(rawLease.bytes instanceof Uint8Array)) {
    fail("vault_contract_violation", "vault lease bytes must be Uint8Array");
  }
  if (rawLease.bytes.byteLength < 1 || rawLease.bytes.byteLength > MAX_SECRET_BYTES) {
    fail("vault_contract_violation", "vault lease byte length is invalid");
  }

  let version;
  if (rawLease.version !== undefined && rawLease.version !== null) {
    version = String(rawLease.version).trim();
    if (!VERSION_PATTERN.test(version)) {
      fail("vault_contract_violation", "vault lease version is invalid");
    }
  }

  let expiresAt;
  if (rawLease.expiresAt !== undefined && rawLease.expiresAt !== null) {
    const current = normalizeNow(now);
    const expiry = new Date(rawLease.expiresAt);
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= current.getTime()) {
      fail("vault_lease_expired", "vault lease is expired");
    }
    if (expiry.getTime() - current.getTime() > maxLeaseLifetimeMs) {
      fail("vault_contract_violation", "vault lease lifetime exceeds the allowed bound");
    }
    expiresAt = expiry.toISOString();
  }

  return Object.freeze({
    bytes: Buffer.from(rawLease.bytes),
    ...(version ? { version } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  });
}

class ConsumerFailure extends Error {
  constructor(error) {
    super("vault consumer failed");
    this[CONSUMER_FAILURE] = error;
  }
}

export function createUnavailableOperatorVaultClient() {
  return Object.freeze({
    async withSecretLease() {
      throw new OperatorVaultSecretProviderError(
        "vault_unavailable",
        "institutional vault is unavailable",
      );
    },
  });
}

export function createOperatorVaultSecretProvider({
  vaultClient,
  allowedSecretRefs,
  now = () => new Date(),
  maxLeaseLifetimeMs = DEFAULT_MAX_LEASE_LIFETIME_MS,
} = {}) {
  const client = requireVaultClient(vaultClient);
  const allowedRefs = normalizeExactRefs(allowedSecretRefs);

  if (
    !Number.isSafeInteger(maxLeaseLifetimeMs) ||
    maxLeaseLifetimeMs < 1_000 ||
    maxLeaseLifetimeMs > 60 * 60_000
  ) {
    throw new TypeError("maxLeaseLifetimeMs must be between 1000 and 3600000");
  }
  normalizeNow(now);

  return Object.freeze({
    async withSecret(access, consumer) {
      const normalizedAccess = normalizeOperatorSecretAccess(access);
      if (!allowedRefs.has(normalizedAccess.secretRef)) {
        fail("vault_reference_denied", "secret reference is not allowed");
      }
      if (typeof consumer !== "function") {
        throw new TypeError("consumer must be a function");
      }

      let callbackCount = 0;
      try {
        const result = await client.withSecretLease(
          Object.freeze({
            secretRef: normalizedAccess.secretRef,
            purpose: normalizedAccess.purpose,
            ...(normalizedAccess.correlationId
              ? { correlationId: normalizedAccess.correlationId }
              : {}),
            ...(normalizedAccess.tenantId ? { tenantId: normalizedAccess.tenantId } : {}),
          }),
          async (rawLease) => {
            callbackCount += 1;
            if (callbackCount > 1) {
              fail(
                "vault_contract_violation",
                "vault invoked the lease consumer more than once",
              );
            }

            const lease = normalizeLease(rawLease, { now, maxLeaseLifetimeMs });
            try {
              return await consumer(lease);
            } catch (error) {
              throw new ConsumerFailure(error);
            } finally {
              lease.bytes.fill(0);
            }
          },
        );

        if (callbackCount !== 1) {
          fail(
            "vault_contract_violation",
            "vault did not invoke the lease consumer exactly once",
          );
        }
        return result;
      } catch (error) {
        if (error?.[CONSUMER_FAILURE]) throw error[CONSUMER_FAILURE];
        if (
          error instanceof OperatorVaultSecretProviderError ||
          error instanceof OperatorSecretContractError
        ) {
          throw error;
        }
        throw new OperatorVaultSecretProviderError(
          "vault_unavailable",
          "institutional vault is unavailable",
        );
      }
    },
  });
}
