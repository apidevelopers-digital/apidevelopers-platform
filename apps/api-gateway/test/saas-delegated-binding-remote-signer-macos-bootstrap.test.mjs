import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
} from "node:crypto";

import {
  readZuniRemoteSignerMacosBootstrapConfig,
  startZuniRemoteSignerMacosTestRuntime,
} from "../src/saas-delegated-binding-remote-signer-macos-runtime.mjs";
import {
  renderZuniRemoteSignerTestLaunchdPlist,
} from "../src/saas-delegated-binding-remote-signer-launchd.mjs";

const FIXED_NOW = "2026-08-16T00:30:00.000Z";

function makeRequest() {
  return {
    version: "zuni-remote-signer/v1",
    operation: "sign-zuni-delegated-binding",
    keyId: "zuni-test-key-2026-08",
    algorithm: "RSA-PSS-SHA256",
    audience: "unico-api-platform:zuni-documents",
    payload: {
      version: "zuni-delegated-binding/v1",
      audience: "unico-api-platform:zuni-documents",
      tenantId: "tenant.acme",
      workspaceId: "workspace.acme",
      accessGrantId: "grant.acme",
      productId: "zuni",
      principalId: "principal.user",
      issuedAt: FIXED_NOW,
      expiresAt: "2026-08-16T00:31:00.000Z",
      nonce: "nonce-bootstrap-1",
    },
    timeoutMs: 1800,
  };
}

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

test("test runtime signs through injected Keychain reader without production activation", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const source = Buffer.from(pem);

  const runtime = await startZuniRemoteSignerMacosTestRuntime({
    env: {
      ZUNI_REMOTE_SIGNER_KEY_ID: "zuni-test-key-2026-08",
      ZUNI_REMOTE_SIGNER_PORT: "0",
    },
    keychainReader: async () => ({
      bytes: source,
      version: "synthetic-test-item",
    }),
    clock: () => new Date(FIXED_NOW),
  });

  try {
    assert.equal(runtime.config.mode, "test");
    assert.equal(runtime.config.host, "127.0.0.1");
    assert.equal(runtime.daemon.address.address, "127.0.0.1");

    const response = await fetch(`http://127.0.0.1:${runtime.daemon.address.port}/v1/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeRequest()),
    });
    assert.equal(response.status, 200);
    const signed = await response.json();
    assert.equal(signed.keyId, "zuni-test-key-2026-08");
    assert.equal(typeof signed.proof, "string");
    assert.equal(signed.proof.split(".").length, 2);
  } finally {
    await runtime.close();
  }

  assert.equal(source.every((byte) => byte === 0), true);
});
