import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createOperatorMacosKeychainNativeWriter,
  OperatorMacosKeychainNativeWriterError,
} from "../src/operator-macos-keychain-native-writer.mjs";
import {
  createOperatorMacosKeychainStorageController,
  OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL,
} from "../src/operator-macos-keychain-storage-controller.mjs";
import {
  OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  OPERATOR_MACOS_KEYCHAIN_SERVICE,
} from "../src/operator-macos-keychain-vault-client.mjs";

const descriptor = {
  service: OPERATOR_MACOS_KEYCHAIN_SERVICE,
  account: OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
};
const allZero = (bytes) => [...bytes].every((value) => value === 0);

test("native writer is disabled by default", async () => {
  let calls = 0;
  const writer = createOperatorMacosKeychainNativeWriter({
    nativeBridge: async () => {
      calls += 1;
      return { created: true, replaced: false, secretReturned: false };
    },
    platform: "darwin",
  });

  await assert.rejects(
    () => writer({ ...descriptor, bytes: Buffer.from("synthetic") }),
    (error) =>
      error instanceof OperatorMacosKeychainNativeWriterError &&
      error.code === "keychain_native_writer_disabled",
  );
  assert.equal(calls, 0);
});

test("native writer sends a fixed bridge request and zeroes temporary bytes", async () => {
  let request;
  const writer = createOperatorMacosKeychainNativeWriter({
    nativeBridge: async (value) => {
      request = value;
      assert.equal(value.secretBytes.toString("utf8"), "synthetic-private-key");
      return { created: true, replaced: false, secretReturned: false };
    },
    enabled: true,
    platform: "darwin",
  });

  assert.deepEqual(
    await writer({ ...descriptor, bytes: Buffer.from("synthetic-private-key") }),
    { created: true, replaced: false, secretReturned: false },
  );
  assert.equal(request.operation, "store-generic-password");
  assert.equal(request.overwrite, false);
  assert.equal(request.returnSecret, false);
  assert.equal(request.accessScope, "current-user");
  assert.equal(allZero(request.secretBytes), true);
});

test("native writer integrates with Gate 3 using synthetic material only", async () => {
  let bridgeRequest;
  const writer = createOperatorMacosKeychainNativeWriter({
    nativeBridge: async (value) => {
      bridgeRequest = value;
      return { created: true, replaced: false, secretReturned: false };
    },
    enabled: true,
    platform: "darwin",
  });
  const controller = createOperatorMacosKeychainStorageController({
    keychainWriter: writer,
    enabled: true,
    platform: "darwin",
    now: () => new Date("2026-08-03T06:45:00.000Z"),
  });

  const evidence = await controller.storePrivateKey({
    approval: OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL,
    privateKeyBytes: Buffer.from("synthetic-github-app-private-key"),
  });

  assert.equal(evidence.keychainItemCreated, true);
  assert.equal(evidence.secretReturned, false);
  assert.equal(evidence.repositoryChanged, false);
  assert.equal(evidence.productionChanged, false);
  assert.match(evidence.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(allZero(bridgeRequest.secretBytes), true);
});

test("native writer has no process, shell, network or Keychain command binding", async () => {
  const source = await readFile(
    new URL("../src/operator-macos-keychain-native-writer.mjs", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "node:child_process",
    "node:http",
    "node:https",
    "fetch(",
    "process.env",
    "/usr/bin/security",
    "add-generic-password",
    "exec(",
    "spawn(",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
