import {
  OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  OPERATOR_MACOS_KEYCHAIN_SERVICE,
} from "./operator-macos-keychain-vault-client.mjs";

const MAX_SECRET_BYTES = 8_192;
const SAFE_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class OperatorMacosKeychainNativeWriterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OperatorMacosKeychainNativeWriterError";
    this.code = code;
    this.details = Object.freeze({});
  }
}

function fail(code, message) {
  throw new OperatorMacosKeychainNativeWriterError(code, message);
}

function normalizeSafeValue(value, field) {
  const normalized = String(value ?? "").trim();
  if (!SAFE_VALUE_PATTERN.test(normalized)) {
    throw new TypeError(`${field} is invalid`);
  }
  return normalized;
}

function validateBridgeResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    fail(
      "keychain_native_bridge_contract_violation",
      "macOS Keychain native bridge returned an invalid result",
    );
  }
  if (
    result.created !== true ||
    result.replaced !== false ||
    result.secretReturned !== false
  ) {
    fail(
      "keychain_native_bridge_contract_violation",
      "macOS Keychain native bridge did not confirm a new non-replaced item",
    );
  }

  return Object.freeze({
    created: true,
    replaced: false,
    secretReturned: false,
  });
}

export function createOperatorMacosKeychainNativeWriter({
  nativeBridge,
  enabled = false,
  platform = process.platform,
  service = OPERATOR_MACOS_KEYCHAIN_SERVICE,
  account = OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  maxSecretBytes = MAX_SECRET_BYTES,
} = {}) {
  if (typeof nativeBridge !== "function") {
    throw new TypeError("nativeBridge must be a function");
  }
  if (typeof enabled !== "boolean") {
    throw new TypeError("enabled must be boolean");
  }
  if (
    !Number.isSafeInteger(maxSecretBytes) ||
    maxSecretBytes < 1 ||
    maxSecretBytes > MAX_SECRET_BYTES
  ) {
    throw new TypeError("maxSecretBytes must be between 1 and 8192");
  }

  const normalizedPlatform = String(platform ?? "").trim();
  const normalizedService = normalizeSafeValue(service, "service");
  const normalizedAccount = normalizeSafeValue(account, "account");

  return async function operatorMacosKeychainNativeWriter({
    service: requestedService,
    account: requestedAccount,
    bytes,
    overwrite = false,
    returnSecret = false,
  } = {}) {
    if (!enabled) {
      fail(
        "keychain_native_writer_disabled",
        "macOS Keychain native writer is disabled by default",
      );
    }
    if (normalizedPlatform !== "darwin") {
      fail(
        "keychain_native_writer_platform_denied",
        "macOS Keychain native writer is only available on darwin",
      );
    }

    const normalizedRequestedService = normalizeSafeValue(
      requestedService,
      "service",
    );
    const normalizedRequestedAccount = normalizeSafeValue(
      requestedAccount,
      "account",
    );
    if (
      normalizedRequestedService !== normalizedService ||
      normalizedRequestedAccount !== normalizedAccount
    ) {
      fail(
        "keychain_native_writer_descriptor_denied",
        "macOS Keychain native writer descriptor is not allowlisted",
      );
    }
    if (overwrite !== false) {
      fail(
        "keychain_native_writer_overwrite_denied",
        "macOS Keychain native writer overwrite is denied",
      );
    }
    if (returnSecret !== false) {
      fail(
        "keychain_native_writer_secret_return_denied",
        "macOS Keychain native writer cannot return secret material",
      );
    }
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError("bytes must be a Uint8Array");
    }
    if (bytes.byteLength < 1 || bytes.byteLength > maxSecretBytes) {
      fail(
        "keychain_native_writer_size_denied",
        "macOS Keychain secret size is outside the allowed range",
      );
    }

    const temporaryBytes = Buffer.from(bytes);
    try {
      let result;
      try {
        result = await nativeBridge(
          Object.freeze({
            operation: "store-generic-password",
            service: normalizedService,
            account: normalizedAccount,
            secretBytes: temporaryBytes,
            overwrite: false,
            returnSecret: false,
            accessScope: "current-user",
          }),
        );
      } catch {
        fail(
          "keychain_native_bridge_failed",
          "macOS Keychain native bridge operation failed",
        );
      }

      return validateBridgeResult(result);
    } finally {
      temporaryBytes.fill(0);
    }
  };
}
