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

const DESCRIPTOR = {
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
    () => writer({ ...DESCRIPTOR, bytes: Buffer.from("synthetic") }),
    (error) =>
      error instanceof OperatorMacosKeychainStorageControllerError &&
      error.code === "keychain_native_writer_disabled",
  );
  assert.equal(calls, 0);
});
