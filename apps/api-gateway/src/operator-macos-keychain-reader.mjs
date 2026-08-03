import {
  OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  OPERATOR_MACOS_KEYCHAIN_SERVICE,
} from "./operator-macos-keychain-vault-client.mjs";

const SECURITY_EXECUTABLE = "/usr/bin/security";
const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OUTPUT_BYTES = 8_192;
const MAX_OUTPUT_BYTES = 8_192;
const SAFE_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class OperatorMacosKeychainReaderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OperatorMacosKeychainReaderError";
    this.code = code;
    this.details = Object.freeze({});
  }
}

function fail(code, message) {
  throw new OperatorMacosKeychainReaderError(code, message);
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

function normalizeProcessResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    fail("keychain_process_contract_violation", "Keychain process returned an invalid result");
  }

  const stdout = result.stdout;
  const stderr = result.stderr;

  if (!(stdout instanceof Uint8Array)) {
    fail(
      "keychain_process_contract_violation",
      "Keychain process stdout must be a Uint8Array",
    );
  }
  if (stderr !== undefined && !(stderr instanceof Uint8Array)) {
    fail(
      "keychain_process_contract_violation",
      "Keychain process stderr must be a Uint8Array when provided",
    );
  }
  if (!Number.isSafeInteger(result.exitCode)) {
    fail(
      "keychain_process_contract_violation",
      "Keychain process exit code must be an integer",
    );
  }
  if (result.timedOut !== undefined && typeof result.timedOut !== "boolean") {
    fail(
      "keychain_process_contract_violation",
      "Keychain process timeout marker must be boolean",
    );
  }

  return {
    stdout,
    stderr,
    exitCode: result.exitCode,
    timedOut: result.timedOut === true,
  };
}

export function createOperatorMacosKeychainReader({
  processRunner,
  enabled = false,
  platform = process.platform,
  service = OPERATOR_MACOS_KEYCHAIN_SERVICE,
  account = OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
} = {}) {
  if (typeof processRunner !== "function") {
    throw new TypeError("processRunner must be a function");
  }
  if (typeof enabled !== "boolean") {
    throw new TypeError("enabled must be boolean");
  }

  const normalizedPlatform = String(platform ?? "").trim();
  const normalizedService = normalizeSafeValue(service, "service");
  const normalizedAccount = normalizeSafeValue(account, "account");
  const normalizedTimeoutMs = normalizeBoundedInteger(
    timeoutMs,
    "timeoutMs",
    100,
    MAX_TIMEOUT_MS,
  );
  const normalizedMaxOutputBytes = normalizeBoundedInteger(
    maxOutputBytes,
    "maxOutputBytes",
    1,
    MAX_OUTPUT_BYTES,
  );

  return async function operatorMacosKeychainReader(descriptor = {}) {
    if (!enabled) {
      fail(
        "keychain_execution_disabled",
        "macOS Keychain execution is disabled by default",
      );
    }
    if (normalizedPlatform !== "darwin") {
      fail(
        "keychain_platform_denied",
        "macOS Keychain execution is only available on darwin",
      );
    }

    const requestedService = normalizeSafeValue(descriptor.service, "service");
    const requestedAccount = normalizeSafeValue(descriptor.account, "account");

    if (
      requestedService !== normalizedService ||
      requestedAccount !== normalizedAccount
    ) {
      fail(
        "keychain_descriptor_denied",
        "macOS Keychain descriptor is not allowlisted",
      );
    }

    const request = Object.freeze({
      executable: SECURITY_EXECUTABLE,
      args: Object.freeze([
        "find-generic-password",
        "-s",
        normalizedService,
        "-a",
        normalizedAccount,
        "-w",
      ]),
      shell: false,
      stdin: null,
      inheritEnvironment: false,
      timeoutMs: normalizedTimeoutMs,
      maxOutputBytes: normalizedMaxOutputBytes,
    });

    let rawResult;
    try {
      rawResult = await processRunner(request);
    } catch {
      fail("keychain_process_failed", "macOS Keychain process failed");
    }

    let stdout =
      rawResult?.stdout instanceof Uint8Array ? rawResult.stdout : undefined;
    let stderr =
      rawResult?.stderr instanceof Uint8Array ? rawResult.stderr : undefined;
    try {
      const result = normalizeProcessResult(rawResult);
      stdout = result.stdout;
      stderr = result.stderr;

      if (result.timedOut) {
        fail("keychain_process_timeout", "macOS Keychain process timed out");
      }
      if (result.exitCode !== 0) {
        fail("keychain_item_unavailable", "macOS Keychain item is unavailable");
      }
      if (stdout.byteLength < 1) {
        fail("keychain_empty_output", "macOS Keychain returned empty output");
      }
      if (stdout.byteLength > normalizedMaxOutputBytes) {
        fail(
          "keychain_output_too_large",
          "macOS Keychain output exceeded the allowed size",
        );
      }

      return Object.freeze({
        bytes: Buffer.from(stdout),
        version: "keychain-v1",
      });
    } finally {
      stdout?.fill(0);
      stderr?.fill(0);
    }
  };
}
