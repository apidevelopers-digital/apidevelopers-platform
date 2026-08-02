import {
  normalizeOperatorSecretAccess,
} from "./operator-secret-provider-contract.mjs";

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DEFAULT_MAX_SECRET_BYTES = 8 * 1024;
const DEFAULT_RESOLVE_TIMEOUT_MS = 10_000;
const MAX_RESOLVE_TIMEOUT_MS = 60_000;

export class OperatorSecretResolverProviderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OperatorSecretResolverProviderError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function boundedInteger(value, fallback, maximum, field) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new TypeError(`${field} must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}

function sanitizedError(code, message) {
  return new OperatorSecretResolverProviderError(code, message);
}

function normalizeResolvedSecret(value, { maxSecretBytes, nowMs }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw sanitizedError(
      "secret_resolver_contract_violation",
      "secret resolver returned an invalid lease",
    );
  }

  if (!(value.bytes instanceof Uint8Array)) {
    throw sanitizedError(
      "secret_resolver_contract_violation",
      "secret resolver lease bytes are invalid",
    );
  }

  if (value.bytes.byteLength < 1 || value.bytes.byteLength > maxSecretBytes) {
    throw sanitizedError(
      "secret_resolver_contract_violation",
      "secret resolver lease size is outside the allowed range",
    );
  }

  let version;
  if (value.version !== undefined && value.version !== null) {
    version = String(value.version).trim();
    if (!VERSION_PATTERN.test(version)) {
      throw sanitizedError(
        "secret_resolver_contract_violation",
        "secret resolver lease version is invalid",
      );
    }
  }

  let expiresAt;
  if (value.expiresAt !== undefined && value.expiresAt !== null) {
    const expiresAtMs = Date.parse(value.expiresAt);
    if (!Number.isFinite(expiresAtMs)) {
      throw sanitizedError(
        "secret_resolver_contract_violation",
        "secret resolver lease expiration is invalid",
      );
    }
    if (!Number.isFinite(nowMs)) {
      throw sanitizedError(
        "secret_resolver_contract_violation",
        "secret resolver clock is invalid",
      );
    }
    if (expiresAtMs <= nowMs) {
      throw sanitizedError(
        "secret_lease_expired",
        "secret resolver returned an expired lease",
      );
    }
    expiresAt = new Date(expiresAtMs).toISOString();
  }

  return {
    bytes: Buffer.from(value.bytes),
    ...(version ? { version } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

async function resolveWithTimeout({ resolveSecret, access, timeoutMs }) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(sanitizedError("secret_resolver_timeout", "secret resolver timed out"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() =>
        resolveSecret(
          Object.freeze({ ...access }),
          Object.freeze({ signal: controller.signal }),
        ),
      ),
      timeout,
    ]);
  } catch (error) {
    if (error instanceof OperatorSecretResolverProviderError) throw error;
    throw sanitizedError("secret_unavailable", "secret resolver is unavailable");
  } finally {
    clearTimeout(timer);
  }
}

export function createOperatorSecretResolverProvider({
  resolveSecret,
  now = () => Date.now(),
  maxSecretBytes = DEFAULT_MAX_SECRET_BYTES,
  resolveTimeoutMs = DEFAULT_RESOLVE_TIMEOUT_MS,
} = {}) {
  if (typeof resolveSecret !== "function") {
    throw new TypeError("resolveSecret must be a function");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }

  const resolvedMaxSecretBytes = boundedInteger(
    maxSecretBytes,
    DEFAULT_MAX_SECRET_BYTES,
    DEFAULT_MAX_SECRET_BYTES,
    "maxSecretBytes",
  );
  const resolvedTimeoutMs = boundedInteger(
    resolveTimeoutMs,
    DEFAULT_RESOLVE_TIMEOUT_MS,
    MAX_RESOLVE_TIMEOUT_MS,
    "resolveTimeoutMs",
  );

  return Object.freeze({
    descriptor: Object.freeze({
      mode: "resolver",
      maxSecretBytes: resolvedMaxSecretBytes,
      resolveTimeoutMs: resolvedTimeoutMs,
      directSecretAccepted: false,
      secretMaterialPersisted: false,
      productionChanged: false,
    }),

    async withSecret(rawAccess, consumer) {
      const access = normalizeOperatorSecretAccess(rawAccess);
      if (typeof consumer !== "function") {
        throw new TypeError("consumer must be a function");
      }

      const rawLease = await resolveWithTimeout({resolveSecret, access, timeoutMs: resolvedTimeoutMs});

      let lease;
      try {
        lease = normalizeResolvedSecret(rawLease, {
          maxSecretBytes: resolvedMaxSecretBytes,
          nowMs: Number(now()),
        });
      } catch (error) {
        if (error instanceof OperatorSecretResolverProviderError) throw error;
        throw sanitizedError(
          "secret_resolver_contract_violation",
          "secret resolver returned an invalid lease",
        );
      }

      try {
        return await consumer(
          Object.freeze({
            bytes: lease.bytes,
            ...(lease.version ? { version: lease.version } : {}),
            ...(lease.expiresAt ? { expiresAt: lease.expiresAt } : {}),
          }),
        );
      } finally {
        lease.bytes.fill(0);
      }
    },
  });
}
