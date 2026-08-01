const SECRET_REF_PATTERN = /^(?:secret|vault):\/\/[A-Za-z0-9](?:[A-Za-z0-9._~/-]{1,254}[A-Za-z0-9])?$/;
const PURPOSE_PATTERN = /^[a-z][a-z0-9._:-]{2,127}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const MAX_SECRET_BYTES = 8192;

const CONSUMER_FAILURE = Symbol("operator-secret-consumer-failure");

export class OperatorSecretContractError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OperatorSecretContractError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function fail(code, message, details = {}) {
  throw new OperatorSecretContractError(code, message, details);
}

export function normalizeOperatorSecretRef(value) {
  const secretRef = String(value ?? "").trim();
  if (!SECRET_REF_PATTERN.test(secretRef)) {
    fail(
      "invalid_secret_ref",
      "secretRef must use an approved opaque secret or vault reference",
      { field: "secretRef" },
    );
  }
  return secretRef;
}

function normalizeOptionalId(value, field) {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim();
  if (!SAFE_ID_PATTERN.test(normalized)) {
    fail("invalid_secret_access", `${field} is invalid`, { field });
  }
  return normalized;
}

export function normalizeOperatorSecretAccess(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_secret_access", "secret access context must be an object");
  }
  const purpose = String(value.purpose ?? "").trim();
  if (!PURPOSE_PATTERN.test(purpose)) {
    fail("invalid_secret_access", "purpose is invalid", { field: "purpose" });
  }
  return Object.freeze({
    secretRef: normalizeOperatorSecretRef(value.secretRef),
    purpose,
    ...(normalizeOptionalId(value.correlationId, "correlationId")
      ? { correlationId: normalizeOptionalId(value.correlationId, "correlationId") }
      : {}),
    ...(normalizeOptionalId(value.tenantId, "tenantId")
      ? { tenantId: normalizeOptionalId(value.tenantId, "tenantId") }
      : {}),
  });
}

export function requireOperatorSecretProvider(provider) {
  if (typeof provider?.withSecret !== "function") {
    throw new TypeError("secretProvider.withSecret must be a function");
  }
  return provider;
}

function normalizeLease(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("secret_contract_violation", "secret provider returned an invalid lease");
  }
  if (!(value.bytes instanceof Uint8Array)) {
    fail(
      "secret_contract_violation",
      "secret lease must expose bytes as Uint8Array",
      { field: "bytes" },
     );
  }
  if (value.bytes.byteLength < 1 || value.bytes.byteLength > MAX_SECRET_BYTES) {
    fail(
      "secret_contract_violation",
      "secret lease byte length is outside the allowed range",
      { field: "bytes" },
    );
  }
  let version;
  if (value.version !== undefined && value.version !== null) {
    version = String(value.version).trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(version)) {
      fail("secret_contract_violation", "secret lease version is invalid", {
        field: "version",
      });
    }
  }
  const expiresAt =
    value.expiresAt === undefined || value.expiresAt === null
      ? undefined
      : new Date(value.expiresAt).toISOString();

  return Object.freeze({
    bytes: Buffer.from(value.bytes),
    ...(version ? { version } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  });
}

function containsSecret(value, bytes) {
  if (value === undefined) return false;
  const text = bytes.toString("utf8");
  if (!text) return false;
  try {
    return JSON.stringify(value).includes(text);
  } catch {
    return false;
  }
}

class ConsumerFailure extends Error {
  constructor(error) {
    super("secret consumer failed");
    this[CONSUMER_FAILURE] = error;
  }
}

export function createUnavailableOperatorSecretProvider() {
  return Object.freeze({
    async withSecret() {
      throw new OperatorSecretContractError(
        "secret_unavailable",
        "secret provider is unavailable",
      );
    },
  });
}

export async function withOperatorSecret({
  secretProvider,
  access,
  consumer,
} = {}) {
  const provider = requireOperatorSecretProvider(secretProvider);
  const normalizedAccess = normalizeOperatorSecretAccess(access);
  if (typeof consumer !== "function") {
    throw new TypeError("consumer must be a function");
  }

  let callbackCount = 0;
  try {
    const result = await provider.withSecret(normalizedAccess, async (rawLease) => {
      callbackCount += 1;
      if (callbackCount > 1) {
        fail(
          "secret_contract_violation",
          "secret provider invoked the consumer more than once",
        );
      }

      const lease = normalizeLease(rawLease);
      try {
        const consumerResult = await consumer(lease);
        if (containsSecret(consumerResult, lease.bytes)) {
          fail(
            "secret_result_leak",
            "secret material was detected in the consumer result",
          );
        }
        return consumerResult;
      } catch (error) {
        if (containsSecret(error?.message, lease.bytes)) {
          throw new ConsumerFailure(
            new OperatorSecretContractError(
              "secret_consumer_failed",
              "secret consumer failed without exposing provider details",
            ),
          );
        }
        throw new ConsumerFailure(error);
      } finally {
        lease.bytes.fill(0);
      }
    });

    if (callbackCount !== 1) {
      fail(
        "secret_contract_violation",
        "secret provider did not invoke the consumer exactly once",
      );
    }
    return result;
  } catch (error) {
    if (error?.[CONSUMER_FAILURE]) throw error[CONSUMER_FAILURE];
    if (error instanceof OperatorSecretContractError) throw error;
    throw new OperatorSecretContractError(
      "secret_unavailable",
      "secret provider is unavailable",
    );
  }
}
