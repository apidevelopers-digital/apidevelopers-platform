import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  OPERATOR_MACOS_KEYCHAIN_PRIVATE_KEY_REF,
  OPERATOR_MACOS_KEYCHAIN_SERVICE,
  OperatorMacosKeychainVaultClientError,
  createOperatorMacosKeychainVaultClient,
} from "../src/operator-macos-keychain-vault-client.mjs";
import { createOperatorVaultSecretProvider } from "../src/operator-vault-secret-provider.mjs";

const FIXED_NOW = new Date("2026-08-03T05:00:00.000Z");
const ACCESS = Object.freeze({
  secretRef: OPERATOR_MACOS_KEYCHAIN_PRIVATE_KEY_REF,
  purpose: "github.app.private-key.sign",
  correlationId: "corr_keychain_synthetic_001",
  tenantId: "uni.operador",
});

function allZero(bytes) {
  return [...bytes].every((value) => value === 0);
}

test("synthetic Keychain adapter satisfies the vault provider lease contract", async () => {
  const sourceBytes = Buffer.from("synthetic-github-app-private-key");
  let leasedBytes;
  let descriptor;

  const vaultClient = createOperatorMacosKeychainVaultClient({
    keychainReader: async (value) => {
      descriptor = value;
      return {
        bytes: sourceBytes,
        version: "synthetic-v1",
      };
    },
    now: () => FIXED_NOW,
  });
  const provider = createOperatorVaultSecretProvider({
    vaultClient,
    allowedSecretRefs: [OPERATOR_MACOS_KEYCHAIN_PRIVATE_KEY_REF],
    now: () => FIXED_NOW,
  });

  const result = await provider.withSecret(ACCESS, async (lease) => {
    leasedBytes = lease.bytes;
    assert.equal(lease.bytes.toString("utf8"), "synthetic-github-app-private-key");
    assert.equal(lease.version, "synthetic-v1");
    assert.equal(lease.expiresAt, "2026-08-03T05:01:00.000Z");
    return Object.freeze({ signed: false, synthetic: true });
  });

  assert.deepEqual(result, { signed: false, synthetic: true });
  assert.deepEqual(descriptor, {
    service: OPERATOR_MACOS_KEYCHAIN_SERVICE,
    account: OPERATOR_MACOS_KEYCHAIN_ACCOUNT,
  });
  assert.equal(allZero(sourceBytes), true);
  assert.equal(allZero(leasedBytes), true);
});

test("adapter denies unknown references and purposes before reading Keychain", async () => {
  let calls = 0;
  const client = createOperatorMacosKeychainVaultClient({
    keychainReader: async () => {
      calls += 1;
      return { bytes: Buffer.from("never-read") };
    },
  });

  await assert.rejects(
    () =>
      client.withSecretLease(
        {
          ...ACCESS,
          secretRef: "vault://github/operator-macos-keychain/other-key",
        },
        async () => undefined,
      ),
    (error) =>
      error instanceof OperatorMacosKeychainVaultClientError &&
      error.code === "keychain_reference_denied",
  );
  await assert.rejects(
    () =>
      client.withSecretLease(
        { ...ACCESS, purpose: "github.app.private-key.export" },
        async () => undefined,
      ),
    (error) =>
      error instanceof OperatorMacosKeychainVaultClientError &&
      error.code === "keychain_purpose_denied",
  );
  assert.equal(calls, 0);
});

test("adapter sanitizes reader failures without leaking provider details", async () => {
  const client = createOperatorMacosKeychainVaultClient({
    keychainReader: async () => {
      throw new Error("PRIVATE KEY MATERIAL MUST NEVER APPEAR");
    },
  });

  await assert.rejects(
    () => client.withSecretLease(ACCESS, async () => undefined),
    (error) => {
      assert.equal(error.code, "keychain_unavailable");
      assert.equal(error.message, "macOS Keychain is unavailable");
      assert.equal(
        JSON.stringify(error).includes("PRIVATE KEY MATERIAL"),
        false,
      );
      return true;
    },
  );
});

test("adapter zeros oversized synthetic material when failing closed", async () => {
  const sourceBytes = Buffer.alloc(33, 65);
  const client = createOperatorMacosKeychainVaultClient({
    keychainReader: async () => ({ bytes: sourceBytes }),
    maxSecretBytes: 32,
  });

  await assert.rejects(
    () => client.withSecretLease(ACCESS, async () => undefined),
    (error) =>
      error instanceof OperatorMacosKeychainVaultClientError &&
      error.code === "keychain_contract_violation",
  );
  assert.equal(allZero(sourceBytes), true);
});

test("consumer failures are preserved while temporary bytes are zeroed", async () => {
  const sourceBytes = Buffer.from("synthetic-consumer-failure");
  let leasedBytes;
  const expected = new Error("consumer failed safely");
  const client = createOperatorMacosKeychainVaultClient({
    keychainReader: async () => ({ bytes: sourceBytes }),
  });

  await assert.rejects(
    () =>
      client.withSecretLease(ACCESS, async (lease) => {
        leasedBytes = lease.bytes;
        throw expected;
      }),
    (error) => error === expected,
  );
  assert.equal(allZero(sourceBytes), true);
  assert.equal(allZero(leasedBytes), true);
});

test("adapter is injection-only and contains no shell, network or environment access", async () => {
  const source = await readFile(
    new URL("../src/operator-macos-keychain-vault-client.mjs", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "node:child_process",
    "node:https",
    "node:http",
    "fetch(",
    "process.env",
    "security ",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
