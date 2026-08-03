import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createOperatorMacosKeychainHelperBridge,
  OPERATOR_MACOS_KEYCHAIN_HELPER_EXECUTABLE,
  OPERATOR_MACOS_KEYCHAIN_HELPER_PROTOCOL,
  OperatorMacosKeychainHelperBridgeError,
} from "../src/operator-macos-keychain-helper-bridge.mjs";
import {
  createOperatorMacosKeychainNativeWriter,
} from "../src/operator-macos-keychain-native-writer.mjs";
import {
  createOperatorMacosKeychainStorageController,
  OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL,
} from "../src/operator-macos-keychain-storage-controller.mjs";
import {
  OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  OPERATOR_MACOS_KEYCHAIN_SERVICE,
} from "../src/operator-macos-keychain-vault-client.mjs";

const request = Object.freeze({
  operation: "store-generic-password",
  service: OPERATOR_MACOS_KEYCHAIN_SERVICE,
  account: OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  overwrite: false,
  returnSecret: false,
  accessScope: "current-user",
});

const successPayload = () =>
  Buffer.from(
    JSON.stringify({
      protocol: OPERATOR_MACOS_KEYCHAIN_HELPER_PROTOCOL,
      created: true,
      replaced: false,
      secretReturned: false,
    }),
  );

const allZero = (bytes) => [...bytes].every((value) => value === 0);

test("helper bridge is fail-closed while disabled", async () => {
  let calls = 0;
  const bridge = createOperatorMacosKeychainHelperBridge({
    processRunner: async () => {
      calls += 1;
      return { stdout: successPayload(), exitCode: 0 };
    },
    platform: "darwin",
  });

  await assert.rejects(
    () => bridge({ ...request, secretBytes: Buffer.from("synthetic") }),
    (error) =>
      error instanceof OperatorMacosKeychainHelperBridgeError &&
      error.code === "keychain_helper_bridge_disabled",
  );
  assert.equal(calls, 0);
});

test("helper bridge emits a fixed shell-free descriptor and zeroes all temporary buffers", async () => {
  const stdout = successPayload();
  const stderr = Buffer.from("synthetic-diagnostic");
  let descriptor;

  const bridge = createOperatorMacosKeychainHelperBridge({
    processRunner: async (value) => {
      descriptor = value;
      assert.equal(value.stdinBytes.toString("utf8"), "synthetic-private-key");
      return { stdout, stderr, exitCode: 0, timedOut: false };
    },
    enabled: true,
    platform: "darwin",
    timeoutMs: 1_500,
  });

  const result = await bridge({
    ...request,
    secretBytes: Buffer.from("synthetic-private-key"),
  });

  assert.deepEqual(result, {
    created: true,
    replaced: false,
    secretReturned: false,
  });
  assert.equal(descriptor.executable, OPERATOR_MACOS_KEYCHAIN_HELPER_EXECUTABLE);
  assert.equal(descriptor.shell, false);
  assert.equal(descriptor.inheritEnvironment, false);
  assert.equal(descriptor.timeoutMs, 1_500);
  assert.equal(descriptor.args.includes("synthetic-private-key"), false);
  assert.deepEqual(descriptor.args, [
    "store-generic-password",
    "--protocol",
    OPERATOR_MACOS_KEYCHAIN_HELPER_PROTOCOL,
    "--service",
    OPERATOR_MACOS_KEYCHAIN_SERVICE,
    "--account",
    OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
    "--access-scope",
    "current-user",
    "--create-only",
    "--no-secret-output",
  ]);
  assert.equal(allZero(descriptor.stdinBytes), true);
  assert.equal(allZero(stdout), true);
  assert.equal(allZero(stderr), true);
});

test("helper bridge rejects descriptor changes, overwrite and secret return before the process", async () => {
  let calls = 0;
  const bridge = createOperatorMacosKeychainHelperBridge({
    processRunner: async () => {
      calls += 1;
      return { stdout: successPayload(), exitCode: 0 };
    },
    enabled: true,
    platform: "darwin",
  });

  for (const value of [
    { ...request, service: "other.service", secretBytes: Buffer.from("x") },
    { ...request, overwrite: true, secretBytes: Buffer.from("x") },
    { ...request, returnSecret: true, secretBytes: Buffer.from("x") },
    { ...request, accessScope: "system", secretBytes: Buffer.from("x") },
  ]) {
    await assert.rejects(
      () => bridge(value),
      OperatorMacosKeychainHelperBridgeError,
    );
  }

  assert.equal(calls, 0);
});

test("helper bridge sanitizes process errors, timeouts and malformed responses", async () => {
  const scenarios = [
    {
      result: () => {
        throw new Error("PRIVATE MATERIAL MUST NEVER APPEAR");
      },
      code: "keychain_helper_process_failed",
    },
    {
      result: () => ({
        stdout: successPayload(),
        stderr: Buffer.from("private-path"),
        exitCode: 0,
        timedOut: true,
      }),
      code: "keychain_helper_process_timeout",
    },
    {
      result: () => ({
        stdout: Buffer.from('{"created":true,"extra":"secret"}'),
        stderr: Buffer.alloc(0),
        exitCode: 0,
      }),
      code: "keychain_helper_invalid_response",
    },
  ];

  for (const scenario of scenarios) {
    let captured;
    const bridge = createOperatorMacosKeychainHelperBridge({
      processRunner: async (descriptor) => {
        captured = descriptor;
        return scenario.result();
      },
      enabled: true,
      platform: "darwin",
    });

    await assert.rejects(
      () => bridge({ ...request, secretBytes: Buffer.from("synthetic-secret") }),
      (error) => {
        assert.equal(error.code, scenario.code);
        assert.equal(
          JSON.stringify(error).includes("PRIVATE MATERIAL MUST NEVER APPEAR"),
          false,
        );
        assert.equal(JSON.stringify(error).includes("private-path"), false);
        return true;
      },
    );
    assert.equal(allZero(captured.stdinBytes), true);
  }
});

test("helper bridge integrates with the native writer and Gate 3 using synthetic material only", async () => {
  let helperDescriptor;
  const bridge = createOperatorMacosKeychainHelperBridge({
    processRunner: async (descriptor) => {
      helperDescriptor = descriptor;
      return {
        stdout: successPayload(),
        stderr: Buffer.alloc(0),
        exitCode: 0,
        timedOut: false,
      };
    },
    enabled: true,
    platform: "darwin",
  });

  const nativeWriter = createOperatorMacosKeychainNativeWriter({
    nativeBridge: bridge,
    enabled: true,
    platform: "darwin",
  });

  const controller = createOperatorMacosKeychainStorageController({
    keychainWriter: nativeWriter,
    enabled: true,
    platform: "darwin",
    now: () => new Date("2026-08-03T08:00:00.000Z"),
  });

  const evidence = await controller.storePrivateKey({
    approval: OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL,
    privateKeyBytes: Buffer.from("synthetic-github-app-private-key"),
  });

  assert.equal(evidence.keychainItemCreated, true);
  assert.equal(evidence.keychainItemReplaced, false);
  assert.equal(evidence.secretReturned, false);
  assert.equal(evidence.repositoryChanged, false);
  assert.equal(evidence.productionChanged, false);
  assert.match(evidence.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(allZero(helperDescriptor.stdinBytes), true);
});

test("helper bridge source has no network, environment or direct security CLI binding", async () => {
  const source = await readFile(
    new URL("../src/operator-macos-keychain-helper-bridge.mjs", import.meta.url),
    "utf8",
  );

  for (const forbidden of [
    "node:http",
    "node:https",
    "fetch(",
    "process.env",
    "/usr/bin/security",
    "add-generic-password",
    "shell: true",
    "node:child_process",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
