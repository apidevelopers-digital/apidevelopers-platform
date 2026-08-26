import {
  OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  OPERATOR_MACOS_KEYCHAIN_SERVICE,
} from "./operator-macos-keychain-vault-client.mjs";

const HELPER_EXECUTABLE = "/usr/local/libexec/apidevelopers/operator-keychain-helper";
const HELPER_PROTOCOL = "operator-keychain-helper.v1";
const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OUTPUT_BYTES = 512;
const MAX_OUTPUT_BYTES = 4_096;
const MAX_SECRET_BYTES = 8_192;
const SAFE_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class OperatorMacosKeychainHelperBridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OperatorMacosKeychainHelperBridgeError";
    this.code = code;
    this.details = Object.freeze({});
  }
}

function fail(code, message) {
  throw new OperatorMacosKeychainHelperBridgeError(code, message);
}

function normalizeSafeValue(value, field) {
  const normalized = String(value ?? "").trim();
  if (!SAFE_VALUE_PATTERN.test(normalized)) {
    throw new TypeError(`${field} is invalid`);
  }
  return normalized;
}

function normalizeBoundedInteger(value, field, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function validateProcessResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    fail("keychain_helper_process_contract_violation", "Keychain helper process returned an invalid result");
  }
  if (!(result.stdout instanceof Uint8Array)) {
    fail("keychain_helper_process_contract_violation", "Keychain helper stdout must be a Uint8Array");
  }
  if (result.stderr !== undefined && !(result.stderr instanceof Uint8Array)) {
    fail("keychain_helper_process_contract_violation", "Keychain helper stderr must be a Uint8Array when provided");
  }
  if (!Number.isSafeInteger(result.exitCode)) {
    fail("keychain_helper_process_contract_violation", "Keychain helper exit code must be an integer");
  }
  if (result.timedOut !== undefined && typeof result.timedOut !== "boolean") {
    fail("keychain_helper_process_contract_violation", "Keychain helper timeout marker must be boolean");
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    timedOut: result.timedOut === true,
  };
}

function parseHelperResponse(stdout, maxOutputBytes) {
  if (stdout.byteLength < 1) fail("keychain_helper_empty_output", "Keychain helper returned empty output");
  if (stdout.byteLength > maxOutputBytes) {
    fail("keychain_helper_output_too_large", "Keychain helper output exceeded the allowed size");
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(stdout).toString("utf8"));
  } catch {
    fail("keychain_helper_invalid_response", "Keychain helper returned an invalid response");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("keychain_helper_invalid_response", "Keychain helper returned an invalid response");
  }

  const keys = Object.keys(parsed).sort();
  const expectedKeys = ["created", "protocol", "replaced", "secretReturned"];
  if (keys.length !== expectedKeys.length || keys.some((value, index) => value !== expectedKeys[index])) {
    fail("keychain_helper_invalid_response", "Keychain helper response shape is not allowlisted");
  }

  if (
    parsed.protocol !== HELPER_PROTOCOL ||
    parsed.created !== true ||
    parsed.replaced !== false ||
    parsed.secretReturned !== false
  ) {
    fail("keychain_helper_invalid_response", "Keychain helper did not confirm a new non-replaced item");
  }

  return Object.freeze({ created: true, replaced: false, secretReturned: false });
}

export function createOperatorMacosKeychainHelperBridge({
  processRunner,
  enabled = false,
  platform = process.platform,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  service = OPERATOR_MACOS_KEYCHAIN_SERVICE,
  account = OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
} = {}) {
  if (typeof processRunner !== "function") throw new TypeError("processRunner must be a function");
  if (typeof enabled !== "boolean") throw new TypeError("enabled must be boolean");

  const normalizedPlatform = String(platform ?? "").trim();
  const normalizedTimeoutMs = normalizeBoundedInteger(timeoutMs, "timeoutMs", 100, MAX_TIMEOUT_MS);
  const normalizedMaxOutputBytes = normalizeBoundedInteger(maxOutputBytes, "maxOutputBytes", 64, MAX_OUTPUT_BYTES);
  const normalizedService = normalizeSafeValue(service, "service");
  const normalizedAccount = normalizeSafeValue(account, "account");

  return async function operatorMacosKeychainHelperBridge({
    operation,
    service: requestedService,
    account: requestedAccount,
    secretBytes,
    overwrite = false,
    returnSecret = false,
    accessScope,
  } = {}) {
    if (!enabled) fail("keychain_helper_bridge_disabled", "macOS Keychain helper bridge is disabled by default");
    if (normalizedPlatform !== "darwin") {
      fail("keychain_helper_bridge_platform_denied", "macOS Keychain helper bridge is only available on darwin");
    }
    if (
      operation !== "store-generic-password" ||
      requestedService !== normalizedService ||
      requestedAccount !== normalizedAccount ||
      accessScope !== "current-user"
    ) {
      fail("keychain_helper_bridge_descriptor_denied", "macOS Keychain helper bridge descriptor is not allowlisted");
    }
    if (overwrite !== false) fail("keychain_helper_bridge_overwrite_denied", "macOS Keychain helper bridge overwrite is denied");
    if (returnSecret !== false) {
      fail("keychain_helper_bridge_secret_return_denied", "macOS Keychain helper bridge cannot return secret material");
    }
    if (!(secretBytes instanceof Uint8Array)) throw new TypeError("secretBytes must be a Uint8Array");
    if (secretBytes.byteLength < 1 || secretBytes.byteLength > MAX_SECRET_BYTES) {
      fail("keychain_helper_bridge_secret_size_denied", "macOS Keychain helper secret size is outside the allowed range");
    }

    const temporarySecretBytes = Buffer.from(secretBytes);
    let stdout;
    let stderr;
    try {
      let rawResult;
      try {
        rawResult = await processRunner(Object.freeze({
          executable: HELPER_EXECUTABLE,
          args: Object.freeze([
            "store-generic-password",
            "--protocol", HELPER_PROTOCOL,
            "--service", normalizedService,
            "--account", normalizedAccount,
            "--access-scope", "current-user",
            "--create-only",
            "--no-secret-output",
          ]),
          shell: false,
          stdinBytes: temporarySecretBytes,
          inheritEnvironment: false,
          timeoutMs: normalizedTimeoutMs,
          maxStdoutBytes: normalizedMaxOutputBytes,
          maxStderrBytes: normalizedMaxOutputBytes,
        }));
      } catch {
        fail("keychain_helper_process_failed", "macOS Keychain helper process failed");
      }

      const result = validateProcessResult(rawResult);
      stdout = result.stdout;
      stderr = result.stderr;

      if (result.timedOut) fail("keychain_helper_process_timeout", "macOS Keychain helper process timed out");
      if (result.exitCode !== 0) fail("keychain_helper_operation_failed", "macOS Keychain helper operation failed");
      return parseHelperResponse(stdout, normalizedMaxOutputBytes);
    } finally {
      temporarySecretBytes.fill(0);
      stdout?.fill(0);
      stderr?.fill(0);
    }
  };
}

export const OPERATOR_MACOS_KEYCHAIN_HELPER_EXECUTABLE = HELPER_EXECUTABLE;
export const OPERATOR_MACOS_KEYCHAIN_HELPER_PROTOCOL = HELPER_PROTOCOL;
