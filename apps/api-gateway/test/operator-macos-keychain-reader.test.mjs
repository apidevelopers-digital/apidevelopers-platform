import assert from "node:assert/strict";
import test from "node:test";

import {
  createOperatorMacosKeychainReader,
  OperatorMacosKeychainReaderError,
} from "../src/operator-macos-keychain-reader.mjs";
import {
  createOperatorMacosKeychainVaultClient,
  OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  OPERATOR_MACOS_KEYCHAIN_PRIVATE_KEY_REF,
  OPERATOR_MACOS_KEYCHAIN_SERVICE,
} from "../src/operator-macos-keychain-vault-client.mjs";
import { createOperatorVaultSecretProvider } from "../src/operator-vault-secret-provider.mjs";

const DESCRIPTOR = Object.freeze({
  service: OPERATOR_MACOS_KEYCHAIN_SERVICE,
  account: OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
});

const ACCESS = Object.freeze({
  secretRef: OPERATOR_MACOS_KEYCHAIN_PRIVATE_KEY_REF,
  purpose: "github.app.private-key.sign",
  correlationId: "corr_keychain_reader_001",
  tenantId: "uni.operador",
});

function allZero(bytes) {
  return [...bytes].every((value) => value === 0);
}

test("reader is fail-closed and does not invoke a process while disabled", async () => {
  let calls = 0;
  const reader = createOperatorMacosKeychainReader({
    processRunner: async () => {
      calls += 1;
      return { stdout: Buffer.from("never"), exitCode: 0 };
    },
    platform: "darwin",
  });

  await assert.rejects(
    () => reader(DESCRIPTOR),
    (error) =>
      error instanceof OperatorMacosKeychainReaderError &&
      error.code === "keychain_execution_disabled",
  );
  assert.equal(calls, 0);
});

test("reader uses a fixed shell-free command descriptor with synthetic output", async () => {
  const stdout = Buffer.from("synthetic-private-key");
  const stderr = Buffer.from("synthetic-diagnostic");
  let request;

  const reader = createOperatorMacosKeychainReader({
    processRunner: async (value) => {
      request = value;
      return { stdout, stderr, exitCode: 0, timedOut: false };
    },
    enabled: true,
    platform: "darwin",
    timeoutMs: 1_500,
  });

  const lease = await reader(DESCRIPTOR);

  assert.deepEqual(request, {
    executable: "/usr/bin/security",
    args: [
      "find-generic-password",
      "-s",
      OPERATOR_MACOS_KEYCHAIN_SERVICE,
      "-a",
      OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
      "-w",
    ],
    shell: false,
    stdin: null,
    inheritEnvironment: false,
    timeoutMs: 1_500,
    maxOutputBytes: 8_192,
  });
  assert.equal(lease.bytes.toString("utf8"), "synthetic-private-key");
  assert.equal(lease.version, "keychain-v1");
  assert.equal(allZero(stdout), true);
  assert.equal(allZero(stderr), true);
  lease.bytes.fill(0);
});

test("reader denies non-allowlisted descriptors before invoking the process", async () => {
  let calls = 0;
  const reader = createOperatorMacosKeychainReader({
    processRunner: async () => {
      calls += 1;
      return { stdout: Buffer.from("never"), exitCode: 0 };
    },
    enabled: true,
    platform: "darwin",
  });

  await assert.rejects(
    () =>
      reader({
        service: OPERATOR_MACOS_KEYCHAIN_SERVICE,
        account: "another-account",
      }),
    (error) =>
      error instanceof OperatorMacosKeychainReaderError &&
      error.code === "keychain_descriptor_denied",
  );
  assert.equal(calls, 0);
});

test("reader sanitizes process failures and zeroes captured output", async () => {
  const stdout = Buffer.from("PRIVATE MATERIAL MUST NOT LEAK");
  const stderr = Buffer.from("native error with sensitive path");

  const reader = createOperatorMacosKeychainReader({
    processRunner: async () => ({
      stdout,
      stderr,
      exitCode: 44,
      timedOut: false,
    }),
    enabled: true,
    platform: "darwin",
  });

  await assert.rejects(
    () => reader(DESCRIPTOR),
    (error) => {
      assert.equal(error.code, "keychain_item_unavailable");
      assert.equal(
        JSON.stringify(error).includes("PRIVATE MATERIAL MUST NOT LEAK"),
        false,
      );
      assert.equal(
        JSON.stringify(error).includes("sensitive path"),
        false,
      );
      return true;
    },
  );
  assert.equal(allZero(stdout), true);
  assert.equal(allZero(stderr), true);
});

test("reader rejects timeout and oversized output while zeroing buffers", async () => {
  const timeoutStdout = Buffer.from("temporary");
  const timeoutReader = createOperatorMacosKeychainReader({
    processRunner: async () => ({
      stdout: timeoutStdout,
      stderr: Buffer.alloc(0),
      exitCode: 0,
      timedOut: true,
    }),
    enabled: true,
    platform: "darwin",
  });

  await assert.rejects(
    () => timeoutReader(DESCRIPTOR),
    (error) => error.code === "keychain_process_timeout",
  );
  assert.equal(allZero(timeoutStdout), true);

  const oversized = Buffer.alloc(33, 65);
  const oversizedReader = createOperatorMacosKeychainReader({
    processRunner: async () => ({
      stdout: oversized,
      stderr: Buffer.alloc(0),
      exitCode: 0,
    }),
    enabled: true,
    platform: "darwin",
    maxOutputBytes: 32,
  });

  await assert.rejects(
    () => oversizedReader(DESCRIPTOR),
    (error) => error.code === "keychain_output_too_large",
  );
  assert.equal(allZero(oversized), true);
});

test("reader integrates end-to-end with the vault client and provider using only synthetic material", async () => {
  const processStdout = Buffer.from("synthetic-github-app-private-key");
  let consumerBytes;

  const keychainReader = createOperatorMacosKeychainReader({
    processRunner: async () => ({
      stdout: processStdout,
      stderr : Buffer.alloc(0),
      exitCode: 0,
      timedOut: false,
    }),
    enabled: true,
    platform: "darwin",
  });

  const vaultClient = createOperatorMacosKeychainVaultClient({
    keychainReader,
    now: () => new Date("2026-08-03T06:00:00.000Z"),
  });
  const provider = createOperatorVaultSecretProvider({
    vaultClient,
    allowedSecretRefs: [OPERATOR_MACOS_KEYCHAIN_PRIVATE_KEY_REF],
    now: () => new Date("2026-08-03T06:00:00.000Z"),
  });

  const result = await provider.withSecret(ACCESS, async (lease) => {
    consumerBytes = lease.bytes;
    assert.equal(
      lease.bytes.toString("utf8"),
      "synthetic-github-app-private-key",
    );
    assert.equal(lease.version, "keychain-v1");
    return Object.freeze({ signed: false, synthetic: true });
  });

  assert.deepEqual(result, { signed: false, synthetic: true });
  assert.equal(allZero(processStdout), true);
  assert.equal(allZero(consumerBytes), true);
});
