import test from "node:test";
import assert from "node:assert/strict";

import {
  provisionUniJuriDelegatedBindingKeypair,
  UNIJURI_DELEGATED_BINDING_KEY_ID,
  UNIJURI_KEYCHAIN_PROVISIONING_APPROVAL,
} from "../src/saas-unijuri-delegated-binding-keychain-provisioner.mjs";
import {
  UNIJURI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
  UNIJURI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
} from "../src/saas-unijuri-delegated-binding-remote-signer-keychain.mjs";

const HELPER_PROTOCOL = "operator-keychain-helper.v1";

test("UniJuri provisioner generates RSA key, stores only private material through stdin, and returns public key", async () => {
  let request;
  const processRunner = async (value) => {
    request = value;
    assert.equal(value.shell, false);
    assert.equal(value.inheritEnvironment, false);
    assert.ok(value.stdinBytes instanceof Uint8Array);
    assert.match(Buffer.from(value.stdinBytes).toString("utf8"), /BEGIN PRIVATE KEY/);
    assert.equal(value.args.includes(UNIJURI_REMOTE_SIGNER_KEYCHAIN_SERVICE), true);
    assert.equal(value.args.includes(UNIJURI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT), true);
    assert.equal(value.args.includes("--create-only"), true);
    assert.equal(value.args.includes("--no-secret-output"), true);
    return {
      stdout: Buffer.from(JSON.stringify({
        protocol: HELPER_PROTOCOL,
        created: true,
        replaced: false,
        secretReturned: false,
      })),
      stderr: Buffer.alloc(0),
      exitCode: 0,
      timedOut: false,
    };
  };

  const result = await provisionUniJuriDelegatedBindingKeypair({
    approval: UNIJURI_KEYCHAIN_PROVISIONING_APPROVAL,
    processRunner,
    platform: "darwin",
    now: () => new Date("2026-08-26T20:30:00.000Z"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.keyId, UNIJURI_DELEGATED_BINDING_KEY_ID);
  assert.equal(result.algorithm, "RSA-PSS-SHA256");
  assert.equal(result.rsaBits, 2048);
  assert.equal(result.keychainItemCreated, true);
  assert.equal(result.keychainItemReplaced, false);
  assert.equal(result.secretReturned, false);
  assert.equal(result.privateKeyArtifactCreated, false);
  assert.match(result.publicKeyPem, /BEGIN PUBLIC KEY/);
  assert.match(result.publicKeyFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.privateKeyFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes("BEGIN PRIVATE KEY"), false);
  assert.equal(request.args.includes("BEGIN PRIVATE KEY"), false);
});

test("UniJuri provisioner fails closed without exact approval and off macOS", async () => {
  let calls = 0;
  const processRunner = async () => {
    calls += 1;
    throw new Error("must not run");
  };

  await assert.rejects(
    () => provisionUniJuriDelegatedBindingKeypair({
      approval: "NO",
      processRunner,
      platform: "darwin",
    }),
    /approval_denied/,
  );
  await assert.rejects(
    () => provisionUniJuriDelegatedBindingKeypair({
      approval: UNIJURI_KEYCHAIN_PROVISIONING_APPROVAL,
      processRunner,
      platform: "linux",
    }),
    /platform_denied/,
  );
  assert.equal(calls, 0);
});
