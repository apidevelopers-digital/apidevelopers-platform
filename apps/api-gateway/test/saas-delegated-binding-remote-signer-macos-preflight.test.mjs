import test from "node:test";
import assert from "node:assert/strict";

import {
  collectZuniRemoteSignerMacosPreflight,
  assertZuniRemoteSignerMacosPreflightIsReadOnly,
} from "../src/saas-delegated-binding-remote-signer-macos-preflight.mjs";

function fakeExec(responses = new Map()) {
  return async (command, args = []) => {
    const key = `${command} ${args.join(" ")}`;
    const value = responses.get(key);
    if (value instanceof Error) throw value;
    if (value) return value;
    const error = new Error("not found");
    error.code = 1;
    throw error;
  };
}

test("preflight is read-only and treats absent test artifacts as advisory", async () => {
  const responses = new Map([
    ["/usr/bin/pmset -g custom", { stdout: "Battery Power:\n", stderr: "" }],
  ]);

  const result = await collectZuniRemoteSignerMacosPreflight({
    platform: "darwin",
    arch: "x64",
    nodePath: "/opt/homebrew/bin/node",
    uid: 501,
    accessFn: async () => {},
    execFn: fakeExec(responses),
  });

  assert.equal(result.mode, "dry-run-read-only");
  assert.equal(result.writesPerformed, false);
  assert.equal(result.safeToPrepareLocalTest, true);
  assert.equal(result.checks.find((c) => c.id === "test_keychain_item_present").detail, "absent");
  assert.equal(result.checks.find((c) => c.id === "test_launchd_service_loaded").detail, "not_loaded");
  assert.equal(assertZuniRemoteSignerMacosPreflightIsReadOnly(result), result);
});

test("preflight fails hard off macOS or without required binaries", async () => {
  const result = await collectZuniRemoteSignerMacosPreflight({
    platform: "linux",
    arch: "x64",
    nodePath: "/usr/bin/node",
    uid: 1000,
    accessFn: async () => {
      throw new Error("missing");
    },
    execFn: fakeExec(),
  });

  assert.equal(result.safeToPrepareLocalTest, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(result.checks.find((c) => c.id === "platform").ok, false);
  assert.equal(result.checks.find((c) => c.id === "security_binary").ok, false);
  assert.equal(result.checks.find((c) => c.id === "launchctl_binary").ok, false);
});

test("preflight never requests keychain secret value", async () => {
  const calls = [];
  const execFn = async (command, args = []) => {
    calls.push([command, [...args]]);
    if (command === "/usr/bin/pmset") return { stdout: "", stderr: "" };
    const error = new Error("not present");
    error.code = 44;
    throw error;
  };

  await collectZuniRemoteSignerMacosPreflight({
    platform: "darwin",
    arch: "x64",
    nodePath: "/opt/homebrew/bin/node",
    uid: 501,
    accessFn: async () => {},
    execFn,
  });

  const keychainCall = calls.find(([command]) => command === "/usr/bin/security");
  assert.ok(keychainCall);
  assert.equal(keychainCall[1].includes("-w"), false);
  assert.equal(keychainCall[1].includes("-g"), false);
});

test("read-only assertion rejects mutated result", () => {
  assert.throws(
    () => assertZuniRemoteSignerMacosPreflightIsReadOnly({
      mode: "dry-run-read-only",
      writesPerformed: true,
    }),
    /remote_signer_preflight_not_read_only/,
  );
});
