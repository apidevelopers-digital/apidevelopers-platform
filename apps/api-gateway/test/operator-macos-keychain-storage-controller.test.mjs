import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createOperatorMacosKeychainStorageController,
  OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL,
  OperatorMacosKeychainStorageControllerError,
} from "../src/operator-macos-keychain-storage-controller.mjs";
import {
  OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  OPERATOR_MACOS_KEYCHAIN_SERVICE,
} from "../src/operator-macos-keychain-vault-client.mjs";

const FIXED_NOW = new Date("2026-08-03T06:30:00.000Z");

function allZero(bytes) {
  return [...bytes].every((value) => value === 0);
}

test("storage controller is fail-closed and never calls the writer while disabled", async () => {
  let calls = 0;
  const controller = createOperatorMacosKeychainStorageController({
    keychainWriter: async () => {
      calls += 1;
      return { created: true, replaced: false };
    },
    platform: "darwin",
  });

  await assert.rejects(
    () =>
      controller.storePrivateKey({
        approval: OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL,
        privateKeyBytes: Buffer.from("synthetic-private-key"),
      }),
    (error) =>
      error instanceof OperatorMacosKeychainStorageControllerError &&
      error.code === "keychain_storage_disabled",
  );
  assert.equal(calls, 0);
});

test("storage controller requires the exact approval before touching synthetic material", async () => {
  let calls = 0;
  const controller = createOperatorMacosKeychainStorageController({
    keychainWriter: async () => {
      calls += 1;
      return { created: true, replaced: false };
    },
    enabled: true,
    platform: "darwin",
  });

  await assert.rejects(
    () =>
      controller.storePrivateKey({
        approval: "NOT_APPROVED",
        privateKeyBytes: Buffer.from("synthetic-private-key"),
      }),
    (error) =>
      error instanceof OperatorMacosKeychainStorageControllerError &&
      error.code === "keychain_storage_approval_denied",
  );
  assert.equal(calls, 0);
});

test("synthetic storage returns sanitized evidence and zeroes the writer buffer", async () => {
  const callerBytes = Buffer.from("synthetic-github-app-private-key");
  let request;

  const controller = createOperatorMacosKeychainStorageController({
    keychainWriter: async (value) => {
      request = value;
      assert.equal(value.bytes.toString("utf8"), callerBytes.toString("utf8"));
      return { created: true, replaced: false };
    },
    enabled: true,
    platform: "darwin",
    now: () => FIXED_NOW,
  });

  const evidence = await controller.storePrivateKey({
    approval: OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL,
    privateKeyBytes: callerBytes,
  });

  assert.deepEqual(
    {
      ...evidence,
      fingerprint: evidence.fingerprint,
    },
    {
      keychainItemCreated: true,
      keychainItemReplaced: false,
      service: OPERATOR_MACOS_KEYCHAIN_SERVICE,
      account: OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
      fingerprint:
        "sha256:2e63cc13a90726abefe5be04a872b9c6e6d1ba5fa4b265a42bb77304f4983805",
      secretReturned: false,
      repositoryChanged: false,
      productionChanged: false,
      createdAt: "2026-08-03T06:30:00.000Z",
    },
  );
  assert.equal(request.overwrite, false);
  assert.equal(request.returnSecret, false);
  assert.equal(allZero(request.bytes), true);
  assert.equal(
    callerBytes.toString("utf8"),
    "synthetic-github-app-private-key",
  );
});

test("writer failures are sanitized and temporary bytes are zeroed", async () => {
  let request;
  const controller = createOperatorMacosKeychainStorageController({
    keychainWriter: async (value) => {
      request = value;
      throw new Error("PRIVATE KEY MATERIAL MUST NEVER APPEAR");
    },
    enabled: true,
    platform: "darwin",
  });

  await assert.rejects(
    () =>
      controller.storePrivateKey({
        approval: OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL,
        privateKeyBytes: Buffer.from("synthetic-private-key"),
      }),
    (error) => {
      assert.equal(error.code, "keychain_storage_failed");
      assert.equal(
        JSON.stringify(error).includes("PRIVATE KEY MATERIAL MUST NEVER APPEAR"),
        false,
      );
      return true;
    },
  );
  assert.equal(allZero(request.bytes), true);
});

test("storage rejects overwrite and invalid writer confirmation", async () => {
  let calls = 0;
  const controller = createOperatorMacosKeychainStorageController({
    keychainWriter: async () => {
      calls += 1;
      return { created: false, replaced: true };
    },
    enabled: true,
    platform: "darwin",
  });

  await assert.rejects(
    () =>
      controller.storePrivateKey({
        approval: OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL,
        privateKeyBytes: Buffer.from("synthetic-private-key"),
        overwrite: true,
      }),
    (error) => error.code === "keychain_storage_overwrite_denied",
  );
  assert.equal(calls, 0);

  await assert.rejects(
    () =>
      controller.storePrivateKey({
        approval: OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL,
        privateKeyBytes: Buffer.from("synthetic-private-key"),
      }),
    (error) => error.code === "keychain_writer_contract_violation",
  );
  assert.equal(calls, 1);
});

test("storage controller has no process, network or environment access", async () => {
  const source = await readFile(
    new URL(
      "../src/operator-macos-keychain-storage-controller.mjs",
      import.meta.url,
    ),
    "utf8",
  );

  for (const forbidden of [
    "node:child_process",
    "node:http",
    "node:https",
    "fetch(",
    "process.env",
    "/usr/bin/security",
    "find-generic-password",
    "add-generic-password",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
