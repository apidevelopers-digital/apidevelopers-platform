import { createHash } from "node:crypto";

import {
  OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  OPERATOR_MACOS_KEYCHAIN_SERVICE,
} from "./operator-macos-keychain-vault-client.mjs";

const MAX_SECRET_BYTES = 8_192;
const SAFE_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL =
  "IGOR_APROVA_ARMAZENAR_CHAVE_NO_KEYCHAIN";

export class OperatorMacosKeychainStorageControllerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OperatorMacosKeychainStorageControllerError";
    this.code = code;
    this.details = Object.freeze({});
  }
}

function fail(code, message) {
  throw new OperatorMacosKeychainStorageControllerError(code, message);
}

function normalizeSafeValue(value, field) {
  const normalized = String(value ?? "").trim();
  if (!SAFE_VALUE_PATTERN.test(normalized)) {
    throw new TypeError(`${field} is invalid`);
  }
  return normalized;
}

function normalizeDate(now) {
  if (typeof now !== "function") throw new TypeError("now must be a function");
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("now must return a valid date");
  }
  return date;
}

function defaultFingerprint(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeFingerprint(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!SAFE_FINGERPRINT_PATTERN.test(normalized)) {
    fail(
      "keychain_fingerprint_invalid",
      "macOS Keychain fingerprint calculator returned an invalid fingerprint",
    );
  }
  return normalized;
}

function normalizeWriterResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    fail(
      "keychain_writer_contract_violation",
      "macOS Keychain writer returned an invalid result",
    );
  }
  if (result.created !== true || result.replaced !== false) {
    fail(
      "keychain_writer_contract_violation",
      "macOS Keychain writer did not confirm a new non-replaced item",
    );
  }
  return Object.freeze({
    created: true,
    replaced: false,
  });
}

export function createOperatorMacosKeychainStorageController({
  keychainWriter,
  enabled = false,
  platform = process.platform,
  requiredApproval = OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL,
  service = OPERATOR_MACOS_KEYCHAIN_SERVICE,
  account = OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  fingerprint = defaultFingerprint,
  now = () => new Date(),
  maxSecretBytes = MAX_SECRET_BYTES,
} = {}) {
  if (typeof keychainWriter !== "function") {
    throw new TypeError("keychainWriter must be a function");
  }
  if (typeof enabled !== "boolean") {
    throw new TypeError("enabled must be boolean");
  }
  if (typeof fingerprint !== "function") {
    throw new TypeError("fingerprint must be a function");
  }
  if (
    !Number.isSafeInteger(maxSecretBytes) ||
    maxSecretBytes < 1 ||
    maxSecretBytes > MAX_SECRET_BYTES
  ) {
    throw new TypeError("maxSecretBytes must be between 1 and 8192");
  }

  const normalizedPlatform = String(platform ?? "").trim();
  const normalizedRequiredApproval = normalizeSafeValue(
    requiredApproval,
    "requiredApproval",
  );
  const normalizedService = normalizeSafeValue(service, "service");
  const normalizedAccount = normalizeSafeValue(account, "account");
  normalizeDate(now);

  return Object.freeze({
    async storePrivateKey({ approval, privateKeyBytes, overwrite = false } = {}) {
      if (!enabled) {
        fail(
          "keychain_storage_disabled",
          "macOS Keychain storage is disabled by default",
        );
      }
      if (normalizedPlatform !== "darwin") {
        fail(
          "keychain_storage_platform_denied",
          "macOS Keychain storage is only available on darwin",
        );
      }
      if (approval !== normalizedRequiredApproval) {
        fail(
          "keychain_storage_approval_denied",
          "macOS Keychain storage approval is invalid",
        );
      }
      if (overwrite !== false) {
        fail(
          "keychain_storage_overwrite_denied",
          "macOS Keychain overwrite is denied for the pilot",
        );
      }
      if (!(privateKeyBytes instanceof Uint8Array)) {
        throw new TypeError("privateKeyBytes must be a Uint8Array");
      }
      if (
        privateKeyBytes.byteLength < 1 ||
        privateKeyBytes.byteLength > maxSecretBytes
      ) {
        fail(
          "keychain_storage_size_denied",
          "macOS Keychain private key size is outside the allowed range",
        );
      }

      const temporaryBytes = Buffer.from(privateKeyBytes);
      let fingerprintHex;
      try {
        fingerprintHex = normalizeFingerprint(await fingerprint(temporaryBytes));

        let rawResult;
        try {
          rawResult = await keychainWriter(
            Object.freeze({
              service: normalizedService,
              account: normalizedAccount,
              bytes: temporaryBytes,
              overwrite: false,
              returnSecret: false,
            }),
          );
        } catch {
          fail(
            "keychain_storage_failed",
            "macOS Keychain storage operation failed",
          );
        }

        normalizeWriterResult(rawResult);

        return Object.freeze({
          keychainItemCreated: true,
          keychainItemReplaced: false,
          service: normalizedService,
          account: normalizedAccount,
          fingerprint: `sha256:${fingerprintHex}`,
          secretReturned: false,
          repositoryChanged: false,
          productionChanged: false,
          createdAt: normalizeDate(now).toISOString(),
        });
      } finally {
        temporaryBytes.fill(0);
      }
    },
  });
}
