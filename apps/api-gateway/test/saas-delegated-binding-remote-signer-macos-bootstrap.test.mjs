import test from "node:test";
import assert from "node:assert/strict";
import {
  constants as cryptoConstants,
  generateKeyPairSync,
} from "node:crypto";

import {
  readZuniRemoteSignerMacosBootstrapConfig,
  startZuniRemoteSignerMacosTestRuntime,
} from "../src/saas-delegated-binding-remote-signer-macos-runtime.mjs";
import {
  renderZuniRemoteSignerTestLaunchdPlist,
} from "../src/saas-delegated-binding-remote-signer-launchd.mjs";

test("macOS bootstrap is test-only and loopback-only", () => {
  assert.deepEqual(
    readZuniRemoteSignerMacosBootstrapConfig({
      ZUNI_REMOTE_SIGNER_KEY_ID: "test-kid",
    }),
    {
      mode: "test",
      host: "127.0.0.1",
      port: 8765,
      keyId: "test-kid",
    },
  );

  assert.throws(
    () =>
      readZuniRemoteSignerMacosBootstrapConfig({
        ZUNI_REMOTE_SIGNER_MODE: "production",
        ZUNI_REMOTE_SIGNER_KEY_ID: "test-kid",
      }),
    /production_mode_not_authorized/,
  );

  assert.throws(
    () =>
      readZuniRemoteSignerMacosBootstrapConfig({
        ZUNI_REMOTE_SIGNER_HOST: "0.0.0.0",
        ZUNI_REMOTE_SIGNER_KEY_ID: "test-kid",
      }),
    /external_bind_not_authorized/,
   );
});

test("launchd plist contains no private key material and binds to loopback test mode", () => {
  const plist = renderZuniRemoteSignerTestLaunchdPlist({
    nodePath: "/opt/homebrew/bin/node",
    entrypointPath: "/Users/igor/zuni/scripts/start-zuni-remote-signer-macos-test.mjs",
    workingDirectory: "/Users/igor/zuni",
    keyId: "zuni-test-key-2026-08",
    stdoutPath: "/tmp/zuni-remote-signer.out.log",
    stderrPath: "/tmp/zuni-remote-signer.err.log",
  });

  assert.match(plist, /digital\.apidevelopers\.zuni-remote-signer\.test/);
  assert.match(plist, /ZUNI_REMOTE_SIGNER_MODE/);
  assert.match(plist, /<string>test<\/string>/);
  assert.match(plist, /127\.0\.0\.1/);
  assert.doesNotMatch(plist, /PRIVATE_KEY|BEGIN PRIVATE KEY|PEM|SECRET/);
});

test("test runtime can sign through injected Keychain reader without production activation", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const source = Buffer.from(pem);

  const runtime = await startZuniRemoteSignerMacosTestRuntime({
    env: {
      ZUNI_REMOTE_SIGNER_KEY_ID: "zuni-test-key-2026-08",
      ZUNI_REMOTE_SIGNER_PORT: "8766",
    },
    keychainReader: async () => ({
      bytes: source,
      version: "synthetic-test-item",
    }),
    clock: () => new Date("2026-08-16T00:30:00.000Z"),
  });

  try {
    assert.equal(runtime.config.mode, "test");
    assert.equal(runtime.config.host, "127.0.0.1");
    assert.equal(runtime.daemon.address.address, "127.0.0.1");
  } finally {
    await runtime.close();
  }

  assert.equal(source.every((byte) => byte === 0), true);
});
