import test from "node:test";
import assert from "node:assert/strict";

import {
  renderZuniRemoteSignerTestLaunchdPlist,
} from "../src/saas-delegated-binding-remote-signer-launchd.mjs";

test("launchd test plist can pin an explicit temporary keychain path", () => {
  const plist = renderZuniRemoteSignerTestLaunchdPlist({
    nodePath: "/opt/homebrew/bin/node",
    entrypointPath: "/tmp/zuni/start.mjs",
    workingDirectory: "/tmp/zuni",
    keyId: "zuni-local-e2e",
    port: 18765,
    stdoutPath: "/tmp/zuni/stdout.log",
    stderrPath: "/tmp/zuni/stderr.log",
    keychainPath: "/tmp/zuni/test.keychain-db",
  });

  assert.match(plist, /ZUNI_REMOTE_SIGNER_TEST_KEYCHAIN_PATH/);
  assert.match(plist, /\/tmp\/zuni\/test\.keychain-db/);
  assert.match(plist, /<string>test<\/string>/);
  assert.match(plist, /<string>127\.0\.0\.1<\/string>/);
});

test("launchd test plist rejects relative keychain paths", () => {
  assert.throws(
    () =>
      renderZuniRemoteSignerTestLaunchdPlist({
        nodePath: "/opt/homebrew/bin/node",
        entrypointPath: "/tmp/zuni/start.mjs",
        workingDirectory: "/tmp/zuni",
        keyId: "zuni-local-e2e",
        stdoutPath: "/tmp/zuni/stdout.log",
        stderrPath: "/tmp/zuni/stderr.log",
        keychainPath: "relative.keychain-db",
      }),
    /keychainPath must be an absolute path/,
  );
});
